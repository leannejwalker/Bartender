const fs = require("fs");
const path = require("path");
const minecraft = require("minecraft-server-util");
const { EmbedBuilder } = require("discord.js");

const STATE_FILE = path.join(__dirname, "status-state.json");
const DEFAULT_INTERVAL_MS = 60_000;

let updateRunning = false;
let intervalHandle = null;

function loadState() {
    try {
        if (!fs.existsSync(STATE_FILE)) {
            return {};
        }

        return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    } catch (error) {
        console.error("[Minecraft] Could not load state:", error);
        return {};
    }
}

function saveState(state) {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (error) {
        console.error("[Minecraft] Could not save state:", error);
    }
}

function getConfig() {
    const interval = Number(process.env.MC_UPDATE_INTERVAL || DEFAULT_INTERVAL_MS);

    return {
        host: process.env.MC_HOST,
        port: Number(process.env.MC_PORT || 25565),
        displayHost: process.env.MC_DISPLAY_HOST || process.env.MC_HOST,
        statusChannelId: process.env.MC_STATUS_CHANNEL_ID,
        activityChannelId: process.env.MC_ACTIVITY_CHANNEL_ID,
        intervalMs: Number.isFinite(interval) && interval >= 10_000
            ? interval
            : DEFAULT_INTERVAL_MS
    };
}

async function getMinecraftStatus(config) {
    try {
        const result = await minecraft.queryFull(
            config.host,
            config.port,
            {
                timeout: 5000,
                enableSRV: true
            }
        );

        return {
            online: true,
            players: result.players?.online ?? 0,
            maxPlayers: result.players?.max ?? 0,
            playerList: result.players?.list ?? [],
            version: result.version || "Unknown",
            port: result.hostPort || config.port
        };
    } catch (error) {
        console.error("[Minecraft] Query failed:", error.message);

        return {
            online: false,
            players: 0,
            maxPlayers: 0,
            playerList: [],
            version: "Unavailable",
            port: config.port
        };
    }
}

function buildStatusEmbed(status, config) {
    let playerList = "Nobody is currently online";

    if (!status.online) {
        playerList = "Server unavailable";
    } else if (status.playerList.length > 0) {
        playerList = status.playerList.map(name => `• ${name}`).join("\n");
    }

    if (playerList.length > 1024) {
        playerList = `${playerList.slice(0, 1021)}...`;
    }

    return new EmbedBuilder()
        .setColor(status.online ? 0x57f287 : 0xed4245)
        .setTitle("⛏️ Minecraft Server Status")
        .setDescription(status.online ? "🟢 **Online**" : "🔴 **Offline**")
        .addFields(
            {
                name: "Players",
                value: status.online ? `${status.players}/${status.maxPlayers}` : "0",
                inline: true
            },
            {
                name: "Version",
                value: status.version,
                inline: true
            },
            {
                name: "Address",
                value: `\`${config.displayHost}\``,
                inline: true
            },
            {
                name: "Port",
                value: `\`${status.port}\``,
                inline: true
            },
            {
                name: "Online players",
                value: playerList,
                inline: false
            }
        )
        .setFooter({
            text: `Updates every ${Math.round(config.intervalMs / 1000)} seconds`
        })
        .setTimestamp();
}

async function fetchTextChannel(client, channelId, variableName) {
    if (!channelId) {
        console.error(`[Minecraft] ${variableName} is missing from .env`);
        return null;
    }

    try {
        const channel = await client.channels.fetch(channelId);

        if (!channel || !channel.isTextBased()) {
            console.error(`[Minecraft] ${variableName} does not point to a text channel.`);
            return null;
        }

        return channel;
    } catch (error) {
        console.error(`[Minecraft] Could not fetch ${variableName}:`, error.message);
        return null;
    }
}

async function sendActivityChanges(activityChannel, previousState, currentStatus) {
    // Establish a baseline on the first successful run so currently-online
    // players are not incorrectly announced as new joins.
    if (!previousState.initialised) {
        return;
    }

    if (previousState.serverOnline === false && currentStatus.online) {
        await activityChannel.send("🟢 **The Minecraft server is online again.**");
    } else if (previousState.serverOnline === true && !currentStatus.online) {
        await activityChannel.send("🔴 **The Minecraft server has gone offline.**");
    }

    // Do not report everyone as leaving when the server itself becomes unreachable.
    if (!currentStatus.online) {
        return;
    }

    const previousPlayers = Array.isArray(previousState.players)
        ? previousState.players
        : [];

    const currentPlayers = currentStatus.playerList;

    const joined = currentPlayers.filter(
        player => !previousPlayers.includes(player)
    );

    const left = previousPlayers.filter(
        player => !currentPlayers.includes(player)
    );

    for (const player of joined) {
        await activityChannel.send(`🍺 **${player}** joined the Minecraft server.`);
    }

    for (const player of left) {
        await activityChannel.send(`👋 **${player}** left the Minecraft server.`);
    }
}

async function updateStatus(client) {
    if (updateRunning) {
        return;
    }

    updateRunning = true;

    try {
        const config = getConfig();
        const statusChannel = await fetchTextChannel(
            client,
            config.statusChannelId,
            "MC_STATUS_CHANNEL_ID"
        );
        const activityChannel = await fetchTextChannel(
            client,
            config.activityChannelId,
            "MC_ACTIVITY_CHANNEL_ID"
        );

        if (!statusChannel || !activityChannel) {
            return;
        }

        const previousState = loadState();
        const status = await getMinecraftStatus(config);
        const embed = buildStatusEmbed(status, config);

        let statusMessage = null;

        if (previousState.messageId) {
            try {
                statusMessage = await statusChannel.messages.fetch(
                    previousState.messageId
                );
            } catch {
                console.warn("[Minecraft] Previous status message was not found; creating a new one.");
            }
        }

        if (statusMessage) {
            await statusMessage.edit({ embeds: [embed] });
        } else {
            statusMessage = await statusChannel.send({ embeds: [embed] });
        }

        await sendActivityChanges(activityChannel, previousState, status);

        saveState({
            messageId: statusMessage.id,
            initialised: true,
            serverOnline: status.online,
            players: status.online ? status.playerList : previousState.players || []
        });

        console.log("[Minecraft] Status and activity check completed.");
    } catch (error) {
        console.error("[Minecraft] Update failed:", error);
    } finally {
        updateRunning = false;
    }
}

function startMinecraftStatus(client) {
    const config = getConfig();
    const missing = [];

    if (!config.host) missing.push("MC_HOST");
    if (!config.statusChannelId) missing.push("MC_STATUS_CHANNEL_ID");
    if (!config.activityChannelId) missing.push("MC_ACTIVITY_CHANNEL_ID");

    if (missing.length > 0) {
        console.error(`[Minecraft] Missing .env settings: ${missing.join(", ")}`);
        return;
    }

    if (intervalHandle) {
        clearInterval(intervalHandle);
    }

    updateStatus(client).catch(error => {
        console.error("[Minecraft] Initial update failed:", error);
    });

    intervalHandle = setInterval(() => {
        updateStatus(client).catch(error => {
            console.error("[Minecraft] Scheduled update failed:", error);
        });
    }, config.intervalMs);

    console.log(`[Minecraft] Monitoring every ${Math.round(config.intervalMs / 1000)} seconds.`);
}

module.exports = {
    startMinecraftStatus
};
