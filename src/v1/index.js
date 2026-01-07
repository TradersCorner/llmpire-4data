import http from "http";
import { intercept } from "./interceptor.js";
import { addSubscriber } from "./stream.js";
import { buildDecisionCard } from "../decision/DecisionCard.mjs";
import { buildPublicDecisionCard } from "../decision/PublicDecisionCard.mjs";
import { resolveFeedbackContext } from "../feedback/feedbackContext.mjs";
import { deriveAdminQueue } from "../admin/adminQueues.mjs";
import { canPerformAction } from "../admin/adminActions.mjs";
import { appendAdminAction } from "../admin/actionLog.mjs";
import { createTerritoryMetricsStore } from "../governance/territoryMetricsStore.mjs";
import { buildTerritoryMetricsApi } from "../governance/territoryMetricsApi.mjs";
import { buildModeratorQueuesApi } from "../governance/moderatorQueuesApi.mjs";
import { readDecisionCards } from "../governance/decisionCardReader.mjs";
import { readFeedbackContexts } from "../governance/feedbackContextReader.mjs";
import { buildGovQueuesAdapter } from "../governance/govQueuesAdapter.mjs";

const territoryMetricsStore = createTerritoryMetricsStore();
const territoryMetricsApi = buildTerritoryMetricsApi({ store: territoryMetricsStore });
const moderatorQueuesApi = buildModeratorQueuesApi({
  // Placeholder registry; real territory definitions can be wired in via
  // governance when available. For now this keeps the API surface stable
  // and read-only.
  territoryRegistry: {
    listTerritoriesForModerator() {
      return [];
    },
  },
});

const govQueuesAdapter = buildGovQueuesAdapter({
  moderatorQueuesApi,
  decisionCardReader: readDecisionCards,
  feedbackContextReader: readFeedbackContexts,
});

const server = http.createServer(async (req, res) => {
  // READ-ONLY STREAM (SSE)
  if (req.method === "GET" && req.url === "/stream") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*"
    });

    addSubscriber(res);
    return;
  }

  // ADMIN: DECISION CARD PROJECTION (READ-ONLY)
  if (req.method === "POST" && req.url === "/admin/decision-card") {
    let body = "";

    req.on("data", chunk => {
      body += chunk.toString();
    });

    req.on("end", () => {
      let payload;
      try {
        payload = JSON.parse(body || "{}");
      } catch {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Invalid JSON" }));
        return;
      }

      if (!payload || typeof payload !== "object" || !payload.decision) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Missing 'decision' in request body" }));
        return;
      }

      const { decision, evidenceSummary = null } = payload;
      const card = buildDecisionCard(decision, evidenceSummary);

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.end(JSON.stringify({ card }));
    });

    return;
  }

  // PUBLIC: DECISION CARD PROJECTION (READ-ONLY, SAFE FIELDS ONLY)
  if (req.method === "POST" && req.url === "/public/decision-card") {
    let body = "";

    req.on("data", chunk => {
      body += chunk.toString();
    });

    req.on("end", () => {
      let payload;
      try {
        payload = JSON.parse(body || "{}");
      } catch {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Invalid JSON" }));
        return;
      }

      if (!payload || typeof payload !== "object" || !payload.decision) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Missing 'decision' in request body" }));
        return;
      }

      const { decision, evidenceSummary = null } = payload;
      const card = buildPublicDecisionCard(decision, evidenceSummary);

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.end(JSON.stringify({ card }));
    });

    return;
  }

  // IN-FLIGHT READ ENDPOINT
  if (req.method === "POST" && req.url === "/request") {
    let body = "";

    req.on("data", chunk => {
      body += chunk.toString();
      // still no storage  this is just the body buffer for THIS request
    });

    req.on("end", () => {
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        res.statusCode = 400;
        res.end("Invalid JSON");
        return;
      }

      intercept(payload);

      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ status: "ok" }));
    });

    return;
  }


  // ADMIN: QUEUE DERIVATION (READ-ONLY)
  if (req.method === "POST" && req.url === "/admin/queues") {
    let body = "";

    req.on("data", chunk => {
      body += chunk.toString();
    });

    req.on("end", () => {
      let payload;
      try {
        payload = JSON.parse(body || "{}");
      } catch {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Invalid JSON" }));
        return;
      }

      const decisions = Array.isArray(payload.decisions) ? payload.decisions : [];
      const bridgeHealth = payload.bridgeHealth || undefined;

      const items = decisions.map((decision) => {
        const feedbackContext = resolveFeedbackContext(decision, bridgeHealth);
        const queue = deriveAdminQueue(decision, feedbackContext);
        const decisionId = typeof decision.id === "string" ? decision.id : null;
        return { decisionId, queue, feedbackContext };
      });

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.end(JSON.stringify({ items }));
    });

    return;
  }

  // ADMIN: ACTION ENDPOINT (append-only log)
  if (req.method === "POST" && req.url === "/admin/action") {
    let body = "";

    req.on("data", chunk => {
      body += chunk.toString();
    });

    req.on("end", () => {
      let payload;
      try {
        payload = JSON.parse(body || "{}");
      } catch {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Invalid JSON" }));
        return;
      }

      const decision = payload.decision;
      const queue = payload.queue;
      const action = payload.action;
      const actor = payload.actor;
      const bridgeHealth = payload.bridgeHealth || undefined;

      if (!decision || typeof action !== "string" || typeof actor !== "string") {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Missing decision, action, or actor" }));
        return;
      }

      const feedbackContext = resolveFeedbackContext(decision, bridgeHealth);
      const derivedQueue = deriveAdminQueue(decision, feedbackContext);
      const effectiveQueue = queue || derivedQueue;

      const allowed = canPerformAction(decision, effectiveQueue, feedbackContext, action);
      if (!allowed) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "action_not_allowed", queue: effectiveQueue }));
        return;
      }

      const entry = appendAdminAction({
        decisionId: typeof decision.id === "string" ? decision.id : undefined,
        action,
        actor,
        note: payload.note,
      });

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.end(JSON.stringify({ entry, queue: effectiveQueue, feedbackContext }));
    });

    return;
  }

  // GOVERNANCE: TERRITORY METRICS (READ-ONLY) + MODERATOR QUEUES (READ-ONLY)
  if (req.method === "GET" && req.url && req.url.startsWith("/gov/")) {
    const url = new URL(req.url, "http://localhost");
    const segments = url.pathname.split("/").filter(Boolean);

    const sendJson = (status, body) => {
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.end(JSON.stringify(body));
    };

    try {
      // GET /gov/territory/:id/queues?queue=...&includeNone=...
      if (
        segments.length === 4 &&
        segments[0] === "gov" &&
        segments[1] === "territory" &&
        segments[3] === "queues"
      ) {
        const territoryId = decodeURIComponent(segments[2]);
        const queue = url.searchParams.get("queue");
        const includeNone = url.searchParams.get("includeNone");

        const result = await govQueuesAdapter.getTerritoryQueuesView({
          territoryId,
          queue,
          includeNone,
        });

        sendJson(result.status, result.body);
        return;
      }

      // GET /gov/moderator/:id/queues?queue=...&includeNone=...
      if (
        segments.length === 4 &&
        segments[0] === "gov" &&
        segments[1] === "moderator" &&
        segments[3] === "queues"
      ) {
        const moderatorId = decodeURIComponent(segments[2]);
        const queue = url.searchParams.get("queue");
        const includeNone = url.searchParams.get("includeNone");

        const result = await govQueuesAdapter.getModeratorQueuesView({
          moderatorId,
          queue,
          includeNone,
        });

        sendJson(result.status, result.body);
        return;
      }

      // GET /gov/territory/:id/metrics?window=...
      if (
        segments.length === 4 &&
        segments[0] === "gov" &&
        segments[1] === "territory" &&
        segments[3] === "metrics"
      ) {
        const territoryId = decodeURIComponent(segments[2]);
        const window = url.searchParams.get("window");

        const result = territoryMetricsApi.getTerritoryLatest({ territoryId, window });
        sendJson(result.status, result.body);
        return;
      }

      // GET /gov/territory/:id/metrics/history?window=...&limit=...
      if (
        segments.length === 5 &&
        segments[0] === "gov" &&
        segments[1] === "territory" &&
        segments[3] === "metrics" &&
        segments[4] === "history"
      ) {
        const territoryId = decodeURIComponent(segments[2]);
        const window = url.searchParams.get("window");
        const limit = url.searchParams.get("limit");

        const result = territoryMetricsApi.getTerritoryHistory({ territoryId, window, limit });
        sendJson(result.status, result.body);
        return;
      }

      // GET /gov/metrics?window=...
      if (segments.length === 2 && segments[0] === "gov" && segments[1] === "metrics") {
        const window = url.searchParams.get("window");
        const result = territoryMetricsApi.listWindowLatest({ window });
        sendJson(result.status, result.body);
        return;
      }
    } catch (err) {
      sendJson(400, { error: err.message || "bad_request" });
      return;
    }
  }

  res.statusCode = 404;
  res.end("Not found");
});

const port = Number(process.env.PORT || 3000);

server.listen(port, () => {
  console.log(`4data listening on http://localhost:${port}`);
  console.log(`SSE stream:       http://localhost:${port}/stream`);
});
