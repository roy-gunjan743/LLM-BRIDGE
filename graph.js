/* graph.js — LLM Bridge Memory Graph viewer */

(function () {
    "use strict";

    // ─── Constants ──────────────────────────────────────────────────────────

    const NODE_COLORS = {
        project:    "#f5c842",
        technology: "#a78bfa",
        goal:       "#34d399",
        task:       "#60a5fa",
        decision:   "#fb923c",
        issue:      "#f87171",
        next_step:  "#22d3ee",
        default:    "#6c7fff"
    };

    const NODE_SIZES = {
        project:  58,
        technology: 40,
        goal:     38,
        task:     36,
        decision: 36,
        issue:    36,
        next_step: 34,
        default:  32
    };

    // ─── State ───────────────────────────────────────────────────────────────

    let cy = null;
    let fullGraph = { nodes: [], edges: [] };
    let hiddenTypes = new Set();
    let searchQuery = "";
    let selectedNodeId = null;

    // ─── Boot ────────────────────────────────────────────────────────────────

    document.addEventListener("DOMContentLoaded", init);

    async function init() {
        bindToolbar();
        bindFilters();
        bindSearch();
        bindPanel();

        try {
            const response = await sendMessage({ action: "getGraph" });
            if (response && response.success && response.graph) {
                fullGraph = response.graph;
            }
        } catch (err) {
            console.warn("Could not load graph", err);
        }

        hideLoading();
        renderGraph(fullGraph);
    }

    // ─── Cytoscape init ──────────────────────────────────────────────────────

    function renderGraph(graph) {
        const elements = buildElements(graph);

        if (!elements.length) {
            showEmpty(true);
            updateStats(0, 0);
            return;
        }

        showEmpty(false);
        updateStats(graph.nodes.length, graph.edges.length);

        cy = window.cytoscape({
            container: document.getElementById("cy"),
            elements,
            style: buildStyle(),
            layout: buildLayout(elements.length),
            minZoom: 0.1,
            maxZoom: 4,
            wheelSensitivity: 0.3
        });

        cy.on("tap", "node", onNodeTap);
        cy.on("tap", (event) => {
            if (event.target === cy) closePanel();
        });
        cy.on("mouseover", "node", onNodeMouseover);
        cy.on("mouseout",  "node", onNodeMouseout);
        cy.on("mouseover", "edge", onEdgeMouseover);
        cy.on("mouseout",  "edge", onEdgeMouseout);

        // Subtle entrance animation
        cy.nodes().forEach((node) => node.style("opacity", 0));
        cy.edges().forEach((edge) => edge.style("opacity", 0));

        let i = 0;
        const delay = Math.min(30, 800 / Math.max(1, elements.length));
        const nodes = cy.nodes().toArray();
        const ticker = setInterval(() => {
            if (i < nodes.length) {
                nodes[i].animate({ style: { opacity: 1 } }, { duration: 200 });
                i++;
            } else {
                cy.edges().animate({ style: { opacity: 1 } }, { duration: 300 });
                clearInterval(ticker);
            }
        }, delay);
    }

    function buildElements(graph) {
        const elements = [];

        for (const node of graph.nodes) {
            if (hiddenTypes.has(node.type)) continue;
            elements.push({
                group: "nodes",
                data: {
                    id: node.id,
                    label: node.label || node.id,
                    type: node.type || "default",
                    description: node.data && node.data.description ? node.data.description : "",
                    color: NODE_COLORS[node.type] || NODE_COLORS.default,
                    size: NODE_SIZES[node.type] || NODE_SIZES.default
                }
            });
        }

        const nodeIds = new Set(elements.map((e) => e.data.id));

        for (const edge of graph.edges) {
            if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
            elements.push({
                group: "edges",
                data: {
                    id: `${edge.source}__${edge.target}__${edge.relation}`,
                    source: edge.source,
                    target: edge.target,
                    label: edge.relation || "",
                    relation: edge.relation || ""
                }
            });
        }

        return elements;
    }

    function buildStyle() {
        return [
            {
                selector: "node",
                style: {
                    "width": "data(size)",
                    "height": "data(size)",
                    "background-color": "data(color)",
                    "border-width": 2,
                    "border-color": "data(color)",
                    "border-opacity": 0.4,
                    "label": "data(label)",
                    "color": "#e2e8ff",
                    "font-size": 10,
                    "font-family": "JetBrains Mono, monospace",
                    "text-valign": "bottom",
                    "text-halign": "center",
                    "text-margin-y": 6,
                    "text-max-width": 120,
                    "text-wrap": "ellipsis",
                    "text-background-color": "#080b12",
                    "text-background-opacity": 0.75,
                    "text-background-padding": "3px",
                    "text-background-shape": "roundrectangle",
                    "transition-property": "opacity, background-color, border-color, width, height",
                    "transition-duration": "180ms",
                    "shadow-blur": 18,
                    "shadow-color": "data(color)",
                    "shadow-opacity": 0.35,
                    "shadow-offset-x": 0,
                    "shadow-offset-y": 0
                }
            },
            {
                selector: "node:selected",
                style: {
                    "border-width": 3,
                    "border-color": "#fff",
                    "border-opacity": 0.9,
                    "width": (ele) => (NODE_SIZES[ele.data("type")] || 32) * 1.2,
                    "height": (ele) => (NODE_SIZES[ele.data("type")] || 32) * 1.2
                }
            },
            {
                selector: "node.dimmed",
                style: { "opacity": 0.12 }
            },
            {
                selector: "node.highlighted",
                style: {
                    "opacity": 1,
                    "border-width": 3,
                    "border-color": "#fff",
                    "border-opacity": 0.7
                }
            },
            {
                selector: "edge",
                style: {
                    "width": 1.5,
                    "line-color": "#1c2238",
                    "target-arrow-color": "#1c2238",
                    "target-arrow-shape": "triangle",
                    "arrow-scale": 0.8,
                    "curve-style": "bezier",
                    "opacity": 0.7,
                    "transition-property": "opacity, line-color, width",
                    "transition-duration": "180ms"
                }
            },
            {
                selector: "edge:selected, edge.highlighted",
                style: {
                    "line-color": "#6c7fff",
                    "target-arrow-color": "#6c7fff",
                    "width": 2.5,
                    "opacity": 1
                }
            },
            {
                selector: "edge.dimmed",
                style: { "opacity": 0.04 }
            }
        ];
    }

    function buildLayout(count) {
        return {
            name: "cose",
            animate: true,
            animationDuration: 800,
            refresh: 30,
            nodeRepulsion: () => 12000,
            idealEdgeLength: () => 100,
            edgeElasticity: () => 80,
            gravity: count > 30 ? 0.4 : 0.25,
            numIter: 1200,
            initialTemp: 800,
            coolingFactor: 0.95,
            minTemp: 1.0,
            fit: true,
            padding: 60
        };
    }

    // ─── Search ───────────────────────────────────────────────────────────────

    function applySearch(query) {
        if (!cy) return;

        if (!query.trim()) {
            cy.elements().removeClass("dimmed highlighted");
            return;
        }

        const q = query.toLowerCase();
        const matchIds = new Set();

        cy.nodes().forEach((node) => {
            const label = (node.data("label") || "").toLowerCase();
            const desc  = (node.data("description") || "").toLowerCase();
            if (label.includes(q) || desc.includes(q)) matchIds.add(node.id());
        });

        // Expand to neighbors of matched
        matchIds.forEach((id) => {
            const node = cy.getElementById(id);
            node.neighborhood("node").forEach((n) => matchIds.add(n.id()));
        });

        cy.nodes().forEach((node) => {
            if (matchIds.has(node.id())) {
                node.removeClass("dimmed").addClass("highlighted");
            } else {
                node.addClass("dimmed").removeClass("highlighted");
            }
        });

        cy.edges().forEach((edge) => {
            const s = matchIds.has(edge.source().id());
            const t = matchIds.has(edge.target().id());
            if (s && t) { edge.addClass("highlighted").removeClass("dimmed"); }
            else { edge.addClass("dimmed").removeClass("highlighted"); }
        });
    }

    // ─── Filters ─────────────────────────────────────────────────────────────

    function applyFilters() {
        if (!cy) return;

        cy.nodes().forEach((node) => {
            const type = node.data("type");
            if (hiddenTypes.has(type)) {
                node.hide();
            } else {
                node.show();
            }
        });

        cy.edges().forEach((edge) => {
            const srcHidden = hiddenTypes.has(edge.source().data("type"));
            const tgtHidden = hiddenTypes.has(edge.target().data("type"));
            if (srcHidden || tgtHidden) { edge.hide(); } else { edge.show(); }
        });

        applySearch(searchQuery);
    }

    // ─── Node tap → Detail panel ─────────────────────────────────────────────

    function onNodeTap(event) {
        const node = event.target;
        selectedNodeId = node.id();
        showPanel(node);

        // Highlight connected edges
        cy.elements().removeClass("highlighted").removeClass("dimmed");
        const connected = node.connectedEdges();
        const neighbors = node.neighborhood("node");

        cy.nodes().forEach((n) => {
            if (n.id() !== node.id() && !neighbors.has(n)) n.addClass("dimmed");
        });
        cy.edges().forEach((e) => {
            if (connected.has(e)) { e.addClass("highlighted"); }
            else { e.addClass("dimmed"); }
        });

        node.select();
    }

    function showPanel(node) {
        const type   = node.data("type") || "default";
        const label  = node.data("label") || "";
        const desc   = node.data("description") || "";
        const color  = NODE_COLORS[type] || NODE_COLORS.default;

        document.getElementById("panelBadge").textContent = type.replace("_", " ");
        document.getElementById("panelBadge").style.cssText =
            `background:${color}22;color:${color};border:1px solid ${color}44`;
        document.getElementById("panelTitle").textContent = label;

        const bodyEl = document.getElementById("panelBody");
        let html = "";

        if (desc) {
            html += `<div class="panel-section-label">description</div>`;
            html += `<div class="panel-desc">${escapeHtml(desc)}</div>`;
        }

        // Connected nodes
        const connected = node.neighborhood("node");
        const connectedEdges = node.connectedEdges();

        if (connected.length > 0) {
            html += `<div class="panel-section-label">connections (${connected.length})</div>`;
            connected.forEach((neighbor) => {
                const nType  = neighbor.data("type") || "default";
                const nColor = NODE_COLORS[nType] || NODE_COLORS.default;
                const nLabel = escapeHtml(neighbor.data("label") || "");

                // find the edge relation
                let rel = "";
                connectedEdges.forEach((e) => {
                    if (e.source().id() === node.id() && e.target().id() === neighbor.id()) {
                        rel = e.data("relation") || "";
                    } else if (e.target().id() === node.id() && e.source().id() === neighbor.id()) {
                        rel = `← ${e.data("relation") || ""}`;
                    }
                });

                html += `
                  <div class="connection-item" data-nodeid="${escapeHtml(neighbor.id())}">
                    <div class="conn-dot" style="background:${nColor}"></div>
                    <div class="conn-label">${nLabel}</div>
                    <div class="conn-rel">${escapeHtml(rel)}</div>
                  </div>`;
            });
        }

        bodyEl.innerHTML = html;

        // Click on connection item → navigate to that node
        bodyEl.querySelectorAll(".connection-item").forEach((item) => {
            item.addEventListener("click", () => {
                const targetId = item.dataset.nodeid;
                const targetNode = cy.getElementById(targetId);
                if (targetNode.length) {
                    cy.animate({ center: { eles: targetNode }, zoom: cy.zoom() }, { duration: 300 });
                    targetNode.emit("tap");
                }
            });
        });

        document.getElementById("panel").classList.add("open");
    }

    function closePanel() {
        document.getElementById("panel").classList.remove("open");
        selectedNodeId = null;
        if (cy) cy.elements().removeClass("dimmed highlighted").unselect();
    }

    // ─── Tooltip ─────────────────────────────────────────────────────────────

    const tooltipEl = document.getElementById("tooltip");

    function showTooltip(content, x, y) {
        tooltipEl.innerHTML = content;
        tooltipEl.style.display = "block";
        tooltipEl.style.left = `${x + 14}px`;
        tooltipEl.style.top  = `${y - 10}px`;
    }

    function hideTooltip() {
        tooltipEl.style.display = "none";
    }

    function onNodeMouseover(event) {
        const node = event.target;
        const pos  = event.renderedPosition || { x: 0, y: 0 };
        const desc = node.data("description");
        if (desc) showTooltip(escapeHtml(desc), pos.x, pos.y);
    }

    function onNodeMouseout() { hideTooltip(); }

    function onEdgeMouseover(event) {
        const edge = event.target;
        const pos  = event.renderedPosition || { x: 0, y: 0 };
        const rel  = edge.data("relation");
        if (rel) showTooltip(`<span style="color:var(--muted)">${escapeHtml(rel)}</span>`, pos.x, pos.y);
    }

    function onEdgeMouseout() { hideTooltip(); }

    // ─── Toolbar bindings ────────────────────────────────────────────────────

    function bindToolbar() {
        document.getElementById("fitBtn").addEventListener("click", () => {
            if (cy) cy.fit(undefined, 60);
        });

        document.getElementById("relayoutBtn").addEventListener("click", () => {
            if (!cy) return;
            cy.layout(buildLayout(cy.elements().length)).run();
        });

        document.getElementById("exportBtn").addEventListener("click", () => {
            const blob = new Blob([JSON.stringify(fullGraph, null, 2)], { type: "application/json" });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement("a");
            a.href = url;
            a.download = `llmbridge-graph-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    function bindFilters() {
        document.querySelectorAll(".pill").forEach((pill) => {
            pill.addEventListener("click", () => {
                const type = pill.dataset.type;
                if (hiddenTypes.has(type)) {
                    hiddenTypes.delete(type);
                    pill.classList.add("active");
                    const color = NODE_COLORS[type] || NODE_COLORS.default;
                    pill.style.borderColor = color + "30";
                    pill.style.color = "";
                } else {
                    hiddenTypes.add(type);
                    pill.classList.remove("active");
                    pill.style.borderColor = "var(--border)";
                    pill.style.color = "var(--muted)";
                }
                applyFilters();
            });
        });
    }

    function bindSearch() {
        let debounce = null;
        document.getElementById("searchInput").addEventListener("input", (e) => {
            clearTimeout(debounce);
            debounce = setTimeout(() => {
                searchQuery = e.target.value;
                applySearch(searchQuery);
            }, 180);
        });
    }

    function bindPanel() {
        document.getElementById("panelClose").addEventListener("click", closePanel);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    function updateStats(nodeCount, edgeCount) {
        document.getElementById("graphStats").textContent =
            nodeCount ? `${nodeCount} nodes · ${edgeCount} edges` : "";
    }

    function showEmpty(show) {
        document.getElementById("emptyState").style.display = show ? "flex" : "none";
    }

    function hideLoading() {
        const overlay = document.getElementById("loadingOverlay");
        overlay.style.opacity = "0";
        overlay.style.transition = "opacity .3s";
        setTimeout(() => overlay.remove(), 320);
    }

    function sendMessage(message) {
        return new Promise((resolve, reject) => {
            try {
                chrome.runtime.sendMessage(message, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    resolve(response);
                });
            } catch (err) {
                reject(err);
            }
        });
    }

    function escapeHtml(str) {
        return String(str || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

})();
