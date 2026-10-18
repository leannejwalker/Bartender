const fs = require("fs");
const path = require("path");
const minecraft = require("minecraft-server-util");
const { EmbedBuilder } = require("discord.js");

const STATE_FILE = path.join(
    __dirname,
    "status-state.json"
);

function loadState() {
    try {
        if (!fs.existsSync(STATE_FILE)) {
            return {};
        }

        return JSON.parse(
            fs.readFileSync(
                STATE_FILE,
                "utf8"
            )
        );
    } catch {
        return {};
    }
}

function saveState(data) {
    fs.writeFileSync(
        STATE_FILE,
        JSON.stringify(data, null, 2)
    );
}

async function getMinecraftStatus() {
    try {
        const result =
            await minecraft.queryFull(
                process.env.MC_HOST,
                Number(
                    process.env.MC_PORT || 25565
                )
            );

        return {
            online: true,
            players:
                result.players?.online || 0,
            maxPlayers:
                result.players?.max || 0,
            playerList:
                result.players?.list || [],
            version:
                result.version || "Unknown"
        };
    } catch (err) {
        return {
            online: false,
            players: 0,
            maxPlayers: 0,
            playerList: [],
            version: "Unknown"
        };
    }
}

function buildEmbed(status) {
    return new EmbedBuilder()
        .setColor(
            status.online
                ? 0x57f287
                : 0xed4245
        )
        .setTitle(
            "⛏️ Minecraft Server Status"
        )
        .addFields(
            {
                name: "Status",
                value: status.online
                    ? "🟢 Online"
                    : "🔴 Offline",
                inline: true
            },
            {
                name: "Players",
                value: `${status.players}/${status.maxPlayers}`,
                inline: true
            },
            {
                name: "Version",
                value: status.version,
                inline: true
            },
            {
                name: "IP Address",
                value: process.env.MC_DISPLAY_HOST,
                inline: true
            },
            {
                name: "Port",
                value:
                    process.env.MC_PORT ||
                    "25565",
                inline: true
            },
            {
                name: "Online Players",
                value:
                    status.playerList.length >
                    0
                        ? status.playerList.join(
                              "\n"
                          )
                        : "Nobody online"
            }
        )
        .setFooter({
            text: "Updates every 5 minutes"
        })
        .setTimestamp();
}

async function updateStatus(client) {
    const channel =
        await client.channels.fetch(
            process.env
                .MC_STATUS_CHANNEL_ID
        );

    if (
        !channel ||
        !channel.isTextBased()
    ) {
        console.error(
            "Minecraft status channel not found."
        );
        return;
    }

    const status =
        await getMinecraftStatus();

    const embed = buildEmbed(status);

    const state = loadState();

    try {
        if (state.messageId) {
            const message =
                await channel.messages.fetch(
                    state.messageId
                );

            await message.edit({
                embeds: [embed]
            });

            return;
        }
    } catch {
        console.log(
            "Creating new status message..."
        );
    }

    const message =
        await channel.send({
            embeds: [embed]
        });

    saveState({
        messageId: message.id
    });
}

function startMinecraftStatus(
    client
) {
    updateStatus(client);

    setInterval(() => {
        updateStatus(client);
    }, 5 * 60 * 1000);
}

module.exports = {
    startMinecraftStatus
};