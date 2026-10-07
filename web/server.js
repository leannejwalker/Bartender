const http = require("http");
const fs = require("fs");
const path = require("path");

const statsManager =
require("../database/StatsManager");

const PORT =
Number(process.env.WEB_PORT) || 3000;

const HOST =
process.env.WEB_HOST || "0.0.0.0";

const PUBLIC_DIR =
path.join(
__dirname,
"public"
);

function sendJson(
res,
data,
statusCode = 200
) {
const body =
JSON.stringify(data);

```
res.writeHead(
    statusCode,
    {
        "Content-Type":
            "application/json; charset=utf-8",
        "Cache-Control":
            "no-store"
    }
);

res.end(body);
```

}

function sendFile(
res,
filePath
) {
if (!fs.existsSync(filePath)) {
res.writeHead(404);
res.end("Not found");
return;
}

```
const extension =
    path.extname(filePath);

const contentTypes = {
    ".html":
        "text/html; charset=utf-8",

    ".css":
        "text/css; charset=utf-8",

    ".js":
        "application/javascript; charset=utf-8",

    ".json":
        "application/json; charset=utf-8"
};

res.writeHead(
    200,
    {
        "Content-Type":
            contentTypes[extension] ||
            "application/octet-stream"
    }
);

res.end(
    fs.readFileSync(filePath)
);
```

}

function getGuild(client) {
const configuredGuildId =
process.env.DISCORD_GUILD_ID;

```
if (configuredGuildId) {
    return client.guilds.cache.get(
        configuredGuildId
    );
}

return client.guilds.cache.first();
```

}

function getOnlineMembers(guild) {
if (!guild) {
return 0;
}

```
let online = 0;

for (
    const member
    of guild.members.cache.values()
) {
    if (member.user.bot) {
        continue;
    }

    const presence =
        member.presence;

    if (!presence) {
        continue;
    }

    const status =
        presence.status;

    if (
        status === "online" ||
        status === "idle" ||
        status === "dnd"
    ) {
        online++;
    }
}

return online;
```

}

function getCurrentVoiceChannel(
guild,
client
) {
if (!guild || !client.user) {
return null;
}

```
const botMember =
    guild.members.cache.get(
        client.user.id
    );

if (
    !botMember ||
    !botMember.voice
) {
    return null;
}

const voiceChannel =
    botMember.voice.channel;

if (!voiceChannel) {
    return null;
}

return {
    id: voiceChannel.id,
    name: voiceChannel.name
};
```

}

function getBotStatus(client) {
const guild =
getGuild(client);

```
return {
    online:
        client.isReady(),

    username:
        client.user
            ? client.user.tag
            : "Bartender",

    guild:
        guild
            ? {
                id: guild.id,
                name: guild.name,
                memberCount:
                    guild.memberCount
            }
            : null,

    uptime:
        process.uptime(),

    currentVoiceChannel:
        getCurrentVoiceChannel(
            guild,
            client
        )
};
```

}

function handleApi(
req,
res,
client
) {
const requestUrl =
new URL(
req.url,
`http://${req.headers.host}`
);

```
try {
    switch (requestUrl.pathname) {

        case "/api/stats/overview": {
            const overview =
                statsManager.getOverview();

            const guild =
                getGuild(client);

            sendJson(
                res,
                {
                    ...overview,

                    members:
                        guild
                            ? guild.memberCount
                            : 0,

                    onlineMembers:
                        getOnlineMembers(
                            guild
                        )
                }
            );

            return;
        }

        case "/api/stats/daily": {
            const days =
                Number(
                    requestUrl
                        .searchParams
                        .get("days")
                ) || 30;

            sendJson(
                res,
                statsManager.getDailyStats(
                    days
                )
            );

            return;
        }

        case "/api/stats/commands": {
            sendJson(
                res,
                statsManager.getTopCommands(
                    10
                )
            );

            return;
        }

        case "/api/stats/channels": {
            sendJson(
                res,
                statsManager.getTopChannels(
                    10
                )
            );

            return;
        }

        case "/api/stats/users": {
            sendJson(
                res,
                statsManager.getTopUsers(
                    10
                )
            );

            return;
        }

        case "/api/stats/members": {
            sendJson(
                res,
                statsManager.getRecentMemberEvents(
                    20
                )
            );

            return;
        }

        case "/api/status": {
            sendJson(
                res,
                getBotStatus(client)
            );

            return;
        }

        default:
            sendJson(
                res,
                {
                    error:
                        "API endpoint not found"
                },
                404
            );
    }

} catch (error) {
    console.error(
        "[Web] API error:",
        error
    );

    sendJson(
        res,
        {
            error:
                "Internal server error"
        },
        500
    );
}
```

}

function getPublicFile(
requestPath
) {
if (
requestPath === "/" ||
requestPath === ""
) {
return path.join(
PUBLIC_DIR,
"index.html"
);
}

```
const decodedPath =
    decodeURIComponent(
        requestPath
    );

const relativePath =
    decodedPath
        .replace(/^[/\\]+/, "");

const filePath =
    path.resolve(
        PUBLIC_DIR,
        relativePath
    );

const publicRoot =
    path.resolve(
        PUBLIC_DIR
    );

if (
    filePath !== publicRoot &&
    !filePath.startsWith(
        publicRoot + path.sep
    )
) {
    return null;
}

return filePath;
```

}

function startWebServer(client) {
if (!fs.existsSync(PUBLIC_DIR)) {
fs.mkdirSync(
PUBLIC_DIR,
{
recursive: true
}
);
}

const server =
    http.createServer(
        (req, res) => {

            if (
                !req.url
            ) {
                res.writeHead(400);
                res.end(
                    "Bad request"
                );
                return;
            }

            const requestUrl =
                new URL(
                    req.url,
                    `http://${req.headers.host}`
                );

            if (
                requestUrl.pathname
                    .startsWith(
                        "/api/"
                    )
            ) {
                handleApi(
                    req,
                    res,
                    client
                );

                return;
            }

            const filePath =
                getPublicFile(
                    requestUrl.pathname
                );

            if (!filePath) {
                res.writeHead(403);
                res.end(
                    "Forbidden"
                );
                return;
            }

            sendFile(
                res,
                filePath
            );
        }
    );

server.listen(
    PORT,
    HOST,
    () => {
        console.log(
            `🌐 Bartender website listening on ${HOST}:${PORT}`
        );
    }
);

return server;

}

module.exports = {
startWebServer
};
