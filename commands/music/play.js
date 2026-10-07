const { SlashCommandBuilder } = require("discord.js");
const { spawn } = require("child_process");
const musicManager = require("../../music/MusicManager");

const YTDLP_PATH = "/usr/local/bin/yt-dlp";
const NODE_PATH =
    "/home/bartenderadmin/.nvm/versions/node/v24.21.0/bin/node";

const YTDLP_COMMON_ARGS = [
    "--js-runtimes",
    `node:${NODE_PATH}`,
    "--no-playlist",
    "--no-warnings"
];

function runYtDlp(args) {
    return new Promise((resolve, reject) => {
        const process = spawn(
            YTDLP_PATH,
            args,
            {
                stdio: ["ignore", "pipe", "pipe"]
            }
        );

        let stdout = "";
        let stderr = "";

        process.stdout.on(
            "data",
            chunk => stdout += chunk.toString()
        );

        process.stderr.on(
            "data",
            chunk => stderr += chunk.toString()
        );

        process.on("error", reject);

        process.on("close", code => {
            if (code !== 0) {
                reject(
                    new Error(
                        stderr ||
                        `yt-dlp exited with code ${code}`
                    )
                );

                return;
            }

            resolve(stdout);
        });
    });
}

async function getVideoInfo(query) {
    const target =
        query.startsWith("http://") ||
        query.startsWith("https://")
            ? query
            : `ytsearch1:${query}`;

    const output = await runYtDlp([
        ...YTDLP_COMMON_ARGS,
        "--dump-single-json",
        "-f",
        "bestaudio/best",
        target
    ]);

    return JSON.parse(output);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("play")
        .setDescription(
            "Play a song, or resume the current music"
        )
        .addStringOption(option =>
            option
                .setName("query")
                .setDescription(
                    "YouTube URL or song name (optional)"
                )
                .setRequired(false)
        ),

    async execute(interaction) {
        const memberChannel =
            interaction.member?.voice?.channel;

        if (!memberChannel) {
            return interaction.reply({
                content:
                    "❌ You need to be in a voice channel first.",
                ephemeral: true
            });
        }

        const query =
            interaction.options.getString("query");

        /*
         * --------------------------------------------------
         * /play with NO query
         * --------------------------------------------------
         */

        if (!query) {
            const data =
                musicManager.getGuildData(
                    interaction.guildId
                );

            /*
             * If there is a current track and the player
             * is paused, resume it.
             */
            if (data.current) {
                musicManager.connect(
                    interaction.guildId,
                    memberChannel
                );

                musicManager.setTextChannel(
                    interaction.guildId,
                    interaction.channel
                );

                const resumed =
                    musicManager.resume(
                        interaction.guildId
                    );

                if (resumed) {
                    return interaction.reply(
                        "▶️ Resumed the current song."
                    );
                }
            }

            /*
             * If there is something in the queue but
             * nothing is currently playing, start it.
             */
            if (
                !data.current &&
                data.queue.length > 0
            ) {
                musicManager.connect(
                    interaction.guildId,
                    memberChannel
                );

                musicManager.setTextChannel(
                    interaction.guildId,
                    interaction.channel
                );

                await musicManager.playNext(
                    interaction.guildId
                );

                return interaction.reply(
                    "▶️ Started the music queue."
                );
            }

            return interaction.reply({
                content:
                    "🎵 Nothing is paused or queued. Use `/play query:<song>` to start some music.",
                ephemeral: true
            });
        }

        /*
         * --------------------------------------------------
         * /play WITH a query
         * --------------------------------------------------
         */

        await interaction.deferReply();

        try {
            const info =
                await getVideoInfo(query);

            const track = {
                title:
                    info.title ||
                    "Unknown title",

                url:
                    info.webpage_url ||
                    info.original_url ||
                    query,

                durationInSec:
                    Number(info.duration || 0),

                thumbnail:
                    info.thumbnail ||
                    info.thumbnails?.[0]?.url,

                channel:
                    info.uploader ||
                    info.channel ||
                    "YouTube",

                requestedBy:
                    interaction.user.toString()
            };

            const data =
                musicManager.getGuildData(
                    interaction.guildId
                );

            musicManager.connect(
                interaction.guildId,
                memberChannel
            );

            musicManager.setTextChannel(
                interaction.guildId,
                interaction.channel
            );

            const wasPlaying =
                Boolean(data.current);

            await musicManager.add(
                interaction.guildId,
                track
            );

            if (wasPlaying) {
                await interaction.editReply(
                    `🎵 Added **${track.title}** to the queue.`
                );
            } else {
                await interaction.editReply(
                    `▶️ Now playing **${track.title}**`
                );
            }

        } catch (error) {
            console.error(
                "[Music] Play command error:",
                error
            );

            const message =
                String(error?.message || error);

            if (
                message
                    .toLowerCase()
                    .includes("verification")
            ) {
                await interaction.editReply(
                    "❌ YouTube's verification challenge could not be solved."
                );

                return;
            }

            await interaction.editReply(
                `❌ Could not play that: ${message.slice(
                    0,
                    1500
                )}`
            );
        }
    }
};