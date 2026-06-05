var GraphEngine = (() => {
    const GRAPH_KEY = "memoryGraph";

    // ─── Public API ───────────────────────────────────────────────────────────

    async function getGraph() {
        const result = await getStorage([GRAPH_KEY]);
        return normalizeGraph(result[GRAPH_KEY]);
    }

    async function saveGraph(graph) {
        const safe = normalizeGraph(graph);
        safe.updatedAt = Date.now();
        await setStorage({ [GRAPH_KEY]: safe });
        return safe;
    }

    async function clearGraph() {
        await setStorage({ [GRAPH_KEY]: null });
    }

    /**
     * Parse a memory block JSON string (or object) and build a new subgraph.
     * Returns { nodes, edges } — does NOT save automatically.
     */
    function buildFromMemory(memoryRaw) {
        const block = parseBlock(memoryRaw);
        if (!block) return { nodes: [], edges: [] };

        const nodes = [];
        const edges = [];

        // ── Root project node ────────────────────────────────────────────────
        const projectId = "project_llm_bridge";
        nodes.push(makeNode(projectId, "LLM Bridge", "project", {
            description: "Universal AI Memory Chrome Extension"
        }));

        // ── Tech stack ───────────────────────────────────────────────────────
        const techItems = toStringArray(block.TECH_STACK);
        for (const tech of techItems) {
            const id = slug("tech", tech);
            nodes.push(makeNode(id, tech, "technology", {}));
            edges.push(makeEdge(projectId, id, "uses", tech));
        }

        // ── Goals ────────────────────────────────────────────────────────────
        const goalItems = toStringArray(block.GOALS);
        for (const goal of goalItems) {
            const id = slug("goal", goal);
            nodes.push(makeNode(id, truncate(goal, 48), "goal", { description: goal }));
            edges.push(makeEdge(projectId, id, "has_goal", ""));
        }

        // ── Current task ─────────────────────────────────────────────────────
        const taskItems = toStringArray(block.CURRENT_TASK);
        for (const task of taskItems) {
            const id = slug("task", task);
            nodes.push(makeNode(id, truncate(task, 48), "task", { description: task }));
            edges.push(makeEdge(projectId, id, "working_on", ""));
        }

        // ── Decisions ────────────────────────────────────────────────────────
        const decisionItems = toStringArray(block.DECISIONS);
        for (const decision of decisionItems) {
            const id = slug("decision", decision);
            nodes.push(makeNode(id, truncate(decision, 48), "decision", { description: decision }));
            edges.push(makeEdge(projectId, id, "decided", ""));
        }

        // ── Open issues ──────────────────────────────────────────────────────
        const issueItems = toStringArray(block.OPEN_ISSUES);
        for (const issue of issueItems) {
            const id = slug("issue", issue);
            nodes.push(makeNode(id, truncate(issue, 48), "issue", { description: issue }));
            edges.push(makeEdge(projectId, id, "has_issue", ""));
        }

        // ── Next steps ───────────────────────────────────────────────────────
        const nextItems = toStringArray(block.NEXT_STEPS);
        for (const next of nextItems) {
            const id = slug("next", next);
            nodes.push(makeNode(id, truncate(next, 48), "next_step", { description: next }));
            edges.push(makeEdge(projectId, id, "next_step", ""));
        }

        // ── Cross-link: issues → tasks (by keyword overlap) ──────────────────
        for (const issue of issueItems) {
            for (const task of taskItems) {
                if (keywordOverlap(issue, task)) {
                    edges.push(makeEdge(slug("issue", issue), slug("task", task), "blocks", ""));
                }
            }
        }

        // ── Cross-link: decisions → tech (tech mentioned in decision) ─────────
        for (const decision of decisionItems) {
            for (const tech of techItems) {
                const techWord = tech.split(/[\s/]/)[0].toLowerCase();
                if (techWord.length > 2 && decision.toLowerCase().includes(techWord)) {
                    edges.push(makeEdge(slug("decision", decision), slug("tech", tech), "involves", ""));
                }
            }
        }

        return { nodes: dedupeNodes(nodes), edges: dedupeEdges(edges) };
    }

    /**
     * Merge an incoming subgraph into the existing stored graph.
     * Same node ID = update label/data. New ID = add. Edges same.
     */
    async function mergeAndSave(incoming) {
        const existing = await getGraph();
        const merged = mergeGraph(existing, incoming);
        return saveGraph(merged);
    }

    function mergeGraph(existing, incoming) {
        const nodeMap = new Map();
        const edgeSet = new Set();
        const mergedEdges = [];

        for (const node of existing.nodes) {
            nodeMap.set(node.id, { ...node });
        }
        for (const node of incoming.nodes) {
            if (nodeMap.has(node.id)) {
                // Update label and data but preserve createdAt
                const old = nodeMap.get(node.id);
                nodeMap.set(node.id, { ...old, ...node, createdAt: old.createdAt });
            } else {
                nodeMap.set(node.id, node);
            }
        }

        function edgeKey(e) { return `${e.source}||${e.target}||${e.relation}`; }

        for (const edge of existing.edges) {
            const key = edgeKey(edge);
            if (!edgeSet.has(key)) { edgeSet.add(key); mergedEdges.push(edge); }
        }
        for (const edge of incoming.edges) {
            const key = edgeKey(edge);
            if (!edgeSet.has(key)) { edgeSet.add(key); mergedEdges.push(edge); }
        }

        return { nodes: Array.from(nodeMap.values()), edges: mergedEdges };
    }

    /**
     * Search nodes by label or description substring.
     */
    function searchGraph(graph, query) {
        if (!query || !query.trim()) return graph;
        const q = query.toLowerCase().trim();
        const matchingIds = new Set();

        for (const node of graph.nodes) {
            const haystack = `${node.label} ${node.data.description || ""}`.toLowerCase();
            if (haystack.includes(q)) matchingIds.add(node.id);
        }

        const relevantEdges = graph.edges.filter(
            (e) => matchingIds.has(e.source) || matchingIds.has(e.target)
        );

        // Include neighbor nodes of matched nodes (1-hop)
        for (const edge of relevantEdges) {
            matchingIds.add(edge.source);
            matchingIds.add(edge.target);
        }

        return {
            nodes: graph.nodes.filter((n) => matchingIds.has(n.id)),
            edges: relevantEdges
        };
    }

    /**
     * Return 1-hop subgraph around a node.
     */
    function getNeighbors(graph, nodeId) {
        const neighborIds = new Set([nodeId]);
        const relevantEdges = graph.edges.filter((e) => {
            if (e.source === nodeId || e.target === nodeId) {
                neighborIds.add(e.source);
                neighborIds.add(e.target);
                return true;
            }
            return false;
        });
        return {
            nodes: graph.nodes.filter((n) => neighborIds.has(n.id)),
            edges: relevantEdges
        };
    }

    // ─── Internals ────────────────────────────────────────────────────────────

    function makeNode(id, label, type, data) {
        return {
            id,
            label: label || id,
            type,
            data: data || {},
            createdAt: Date.now()
        };
    }

    function makeEdge(source, target, relation, label) {
        return { source, target, relation, label: label || relation };
    }

    function slug(prefix, text) {
        const clean = String(text || "")
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, "")
            .trim()
            .replace(/\s+/g, "_")
            .slice(0, 48);
        return `${prefix}_${clean}`;
    }

    function truncate(text, max) {
        const clean = String(text || "").trim();
        return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
    }

    function toStringArray(value) {
        if (Array.isArray(value)) {
            return value.map((v) => String(v || "").trim()).filter(Boolean);
        }
        if (typeof value === "string" && value.trim()) return [value.trim()];
        return [];
    }

    function keywordOverlap(a, b) {
        const stopwords = new Set(["the", "a", "an", "is", "are", "was", "in", "on", "of", "to", "and", "or", "not", "for", "with"]);
        const words = (s) => s.toLowerCase().split(/\W+/).filter((w) => w.length > 3 && !stopwords.has(w));
        const setA = new Set(words(a));
        return words(b).some((w) => setA.has(w));
    }

    function dedupeNodes(nodes) {
        const seen = new Map();
        for (const node of nodes) {
            if (!seen.has(node.id)) seen.set(node.id, node);
        }
        return Array.from(seen.values());
    }

    function dedupeEdges(edges) {
        const seen = new Set();
        return edges.filter((e) => {
            const key = `${e.source}||${e.target}||${e.relation}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function parseBlock(raw) {
        if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
        const text = String(raw || "").trim()
            .replace(/^```(?:json)?/i, "")
            .replace(/```$/i, "")
            .trim();
        try { return JSON.parse(text); } catch (_) { return null; }
    }

    function normalizeGraph(value) {
        if (!value || typeof value !== "object") return { nodes: [], edges: [], updatedAt: 0 };
        return {
            nodes: Array.isArray(value.nodes) ? value.nodes : [],
            edges: Array.isArray(value.edges) ? value.edges : [],
            updatedAt: Number(value.updatedAt) || 0
        };
    }

    function getStorage(keys) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(keys, (result) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message || "Storage Error"));
                    return;
                }
                resolve(result || {});
            });
        });
    }

    function setStorage(values) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.set(values, () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message || "Storage Error"));
                    return;
                }
                resolve(true);
            });
        });
    }

    return {
        getGraph,
        saveGraph,
        clearGraph,
        buildFromMemory,
        mergeAndSave,
        mergeGraph,
        searchGraph,
        getNeighbors
    };
})();
