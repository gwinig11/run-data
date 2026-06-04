export function createWebhookFitPostHandler({
  hasMutationAccessImpl,
  unauthorizedJsonImpl,
  extractUploadedFitImpl,
  createRunFromUploadImpl,
} = {}) {
  requireHandlerDependency(hasMutationAccessImpl, "hasMutationAccessImpl");
  requireHandlerDependency(unauthorizedJsonImpl, "unauthorizedJsonImpl");
  requireHandlerDependency(extractUploadedFitImpl, "extractUploadedFitImpl");
  requireHandlerDependency(createRunFromUploadImpl, "createRunFromUploadImpl");

  return async function POST(request) {
    try {
      if (!(await hasMutationAccessImpl(request))) return unauthorizedJsonImpl();

      const upload = await extractUploadedFitImpl(request);
      const summary = await createRunFromUploadImpl(upload);

      if (acceptsHtml(request)) return Response.redirect(new URL("/", request.url), 303);
      return Response.json({ ok: true, file: summary.file, run: summary.run }, { status: 201 });
    } catch (error) {
      return Response.json(
        { ok: false, error: error.message || "Upload failed." },
        { status: error.status || 500 },
      );
    }
  };
}

export function createLatestGetHandler({
  hasMutationAccessImpl,
  unauthorizedJsonImpl,
  getLatestRunImpl,
} = {}) {
  requireHandlerDependency(hasMutationAccessImpl, "hasMutationAccessImpl");
  requireHandlerDependency(unauthorizedJsonImpl, "unauthorizedJsonImpl");
  requireHandlerDependency(getLatestRunImpl, "getLatestRunImpl");

  return async function GET(request) {
    try {
      if (!(await hasMutationAccessImpl(request))) return unauthorizedJsonImpl();
      const summary = await getLatestRunImpl();
      return Response.json(summary ? { file: summary.file, summary } : { file: null });
    } catch (error) {
      return jsonError(error, "Could not load latest run.");
    }
  };
}

export function createRawLatestGetHandler({
  hasMutationAccessImpl,
  unauthorizedJsonImpl,
  getLatestRunImpl,
  getRawRunFileImpl,
} = {}) {
  requireHandlerDependency(hasMutationAccessImpl, "hasMutationAccessImpl");
  requireHandlerDependency(unauthorizedJsonImpl, "unauthorizedJsonImpl");
  requireHandlerDependency(getLatestRunImpl, "getLatestRunImpl");
  requireHandlerDependency(getRawRunFileImpl, "getRawRunFileImpl");

  return async function GET(request) {
    try {
      if (!(await hasMutationAccessImpl(request))) return unauthorizedJsonImpl();
      const latest = await getLatestRunImpl();
      const raw = latest?.file?.id ? await getRawRunFileImpl(latest.file.id) : null;
      if (!raw) return new Response("No file uploaded yet.", { status: 404 });
      return rawFileResponse(raw);
    } catch (error) {
      return jsonError(error, "Could not load latest run file.");
    }
  };
}

export function createRawRunGetHandler({
  hasMutationAccessImpl,
  unauthorizedJsonImpl,
  getRawRunFileImpl,
} = {}) {
  requireHandlerDependency(hasMutationAccessImpl, "hasMutationAccessImpl");
  requireHandlerDependency(unauthorizedJsonImpl, "unauthorizedJsonImpl");
  requireHandlerDependency(getRawRunFileImpl, "getRawRunFileImpl");

  return async function GET(request, context) {
    try {
      if (!(await hasMutationAccessImpl(request))) return unauthorizedJsonImpl();

      const { id } = await context.params;
      const raw = await getRawRunFileImpl(id);
      if (!raw) return new Response("Run file not found.", { status: 404 });
      return rawFileResponse(raw);
    } catch (error) {
      return jsonError(error, "Could not load run file.");
    }
  };
}

export function createClearPostHandler({
  hasMutationAccessImpl,
  unauthorizedJsonImpl,
} = {}) {
  requireHandlerDependency(hasMutationAccessImpl, "hasMutationAccessImpl");
  requireHandlerDependency(unauthorizedJsonImpl, "unauthorizedJsonImpl");

  return async function POST(request) {
    if (!(await hasMutationAccessImpl(request))) return unauthorizedJsonImpl();

    if (String(request.headers.get("accept") || "").includes("text/html")) {
      return Response.redirect(new URL("/", request.url), 303);
    }
    return Response.json({
      ok: true,
      skipped: true,
      message: "Clear is retired because run history is now permanent.",
    });
  };
}

function rawFileResponse(raw) {
  return new Response(raw.stream || raw.buffer, {
    headers: {
      "Content-Type": raw.contentType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${escapeHeader(raw.filename)}"`,
    },
  });
}

function jsonError(error, fallback) {
  return Response.json(
    { ok: false, error: error.message || fallback },
    { status: error.status || 500 },
  );
}

function acceptsHtml(request) {
  return String(request.headers.get("accept") || "").includes("text/html");
}

function escapeHeader(value) {
  return String(value).replaceAll(/["\r\n]/g, "_");
}

function requireHandlerDependency(value, name) {
  if (typeof value !== "function") {
    throw new Error(`${name} is required.`);
  }
}
