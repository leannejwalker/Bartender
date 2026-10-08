const http = require("http");
const fs = require("fs");
const path = require("path");

const statsManager = require("../database/StatsManager");

const PORT = Number(process.env.WEB_PORT) || 3000;
const HOST = process.env.WEB_HOST || "127.0.0.1";

const PUBLIC_DIR = path.join(__dirname, "public");

function sendJson(res, data, statusCode = 200) {
    res.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
    });

    res.end(JSON.stringify(data));
}

function sendFile(res, filePath) {
    if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end("Not found");
        return;
    }

    const extension = path.extname(filePath);

    const contentTypes = {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".svg": "image/svg+xml"
    };

    res.writeHead(200, {
        "Content-Type":
            contentTypes[extension] ||
            "application/octet-stream"
    });

    res.end(fs.readFileSync(filePath));
}

function getPublicFile(requestPath) {
    if (requestPath === "/" || requestPath === "") {
        return path.join(PUBLIC_DIR, "index.html");
    }

    let decodedPath;

    try {
        decodedPath = decodeURIComponent(requestPath);
    } catch {
        return null;
    }

    const relativePath = decodedPath.replace(/^[/\\]+/, "");

    const filePath = path.resolve(
        PUBLIC_DIR,
        relativePath
    );

    const publicRoot = path.resolve(PUBLIC_DIR);

    if (
        filePath !== publicRoot &&
        !filePath.startsWith(publicRoot + path.sep)
    ) {
        return null;
    }

    return filePath;
}

function handleApi(req, res) {
    const requestUrl = new URL(
        req.url,
        `http://${req.headers.host || "localhost"}`
    );

    try {
        switch (requestUrl.pathname) {
            case "/api/stats/overview":
                sendJson(
                    res,
                    statsManager.getOverview()
                );
                return;

            case "/api/stats/daily": {
                let days =
                    Number(
                        requestUrl.searchParams.get("days")
                    ) || 30;

                days = Math.max(
                    1,
                    Math.min(365, Math.floor(days))
                );

                sendJson(
                    res,
                    statsManager.getDailyStats(days)
                );
                return;
            }

            case "/api/stats/commands":
                sendJson(
                    res,
                    statsManager.getTopCommands(10)
                );
                return;

            case "/api/stats/channels":
                sendJson(
                    res,
                    statsManager.getTopChannels(10)
                );
                return;

            case "/api/stats/users":
                sendJson(
                    res,
                    statsManager.getTopUsers(10)
                );
                return;

            case "/api/stats/members":
                sendJson(
                    res,
                    statsManager.getRecentMemberEvents(20)
                );
                return;

            case "/api/status":
                sendJson(res, {
                    online: false,
                    username: "Bartender",
                    guild: null,
                    uptime: process.uptime(),
                    currentVoiceChannel: null,
                    note:
                        "Web server is running independently of the Discord bot."
                });
                return;

            default:
                sendJson(
                    res,
                    {
                        error: "API endpoint not found"
                    },
                    404
                );
                return;
        }
    } catch (error) {
        console.error("[Web] API error:", error);

        sendJson(
            res,
            {
                error: "Internal server error"
            },
            500
        );
    }
}

function startWebServer() {
    if (!fs.existsSync(PUBLIC_DIR)) {
        fs.mkdirSync(PUBLIC_DIR, {
            recursive: true
        });
    }

    const server = http.createServer((req, res) => {
        if (!req.url) {
            res.writeHead(400);
            res.end("Bad request");
            return;
        }

        const requestUrl = new URL(
            req.url,
            `http://${req.headers.host || "localhost"}`
        );

        if (requestUrl.pathname.startsWith("/api/")) {
            handleApi(req, res);
            return;
        }

        const filePath = getPublicFile(
            requestUrl.pathname
        );

        if (!filePath) {
            res.writeHead(403);
            res.end("Forbidden");
            return;
        }

        sendFile(res, filePath);
    });

    server.on("error", (error) => {
        console.error("[Web] Server error:", error);
    });

    server.listen(PORT, HOST, () => {
        console.log(
            `🌐 Bartender website listening on ${HOST}:${PORT}`
        );
    });

    return server;
}

startWebServer();

module.exports = {
    startWebServer
};
