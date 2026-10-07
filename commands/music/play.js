const {
    SlashCommandBuilder
} = require("discord.js");

const { spawn } = require("child_process");

const musicManager =
    require("../../music/MusicManager");

const YTDLP_PATH = "/usr/local/bin/yt-dlp";

function runYtDlp(args) {
    return new Promise((resolve, reject) => {
        const process = spawn(
            YTDLP_PATH,
            args,
            {
                stdio: [
                    "ignore",
                    "pipe",
                    "pipe"
                ]
            }
        );

        let stdout = "";
        let stderr = "";

        process.stdout.on("data", chunk => {
            stdout += chunk.toString();
        });

        process.stderr.on("data", chunk => {
            stderr += chunk.toString();
        });

        process.on("error", error => {
            reject(error);
        });

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
    let target = query;

    // If this isn't a YouTube URL, search YouTube.
    if (
        !query.includes("youtube.com/") &&
        !query.includes("youtu.be/")
    ) {
        target =
            `ytsearch1:${query}`;
    }

    const output =
        await runYtDlp([
            "--js-runtimes",
            "node",

            "--no-playlist",
            "--no-warnings",

            "--dump-single-json",

            target
        ]);

    const info =
        JSON.parse(output);

    return info;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("play")
        .setDescription("Play a YouTube song")
        .addStringOption(option =>
            option
                .setName("query")
                .setDescription(
                    "YouTube URL or song name"
                )
                .setRequired(true)
        ),

    async execute(interaction) {
        const query =
            interaction.options.getString(
                "query"
            );

        const voiceChannel =
            interaction.member.voice.channel;

        if (!voiceChannel) {
            return interaction.reply({
                content:
                    "❌ You need to join a voice channel first.",
                ephemeral: true
            });
        }

        await interaction.deferReply();

        try {
            const info =
                await getVideoInfo(query);

            if (!info) {
                return interaction.editReply(
                    "❌ I couldn't find that song on YouTube."
                );
            }

            const videoUrl =
                info.webpage_url ||
                info.original_url;

            if (!videoUrl) {
                return interaction.editReply(
                    "❌ I couldn't determine the YouTube URL."
                );
            }

            const duration =
                Number(
                    info.duration || 0
                );

            const track = {
                title:
                    info.title ||
                    "Unknown title",

                url:
                    videoUrl,

                durationInSec:
                    duration,

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
                await musicManager.connect(
                    interaction.guild,
                    voiceChannel
                );

            data.textChannel =
                interaction.channel;

            await musicManager.add(
                interaction.guild,
                track
            );

            const guildData =
                musicManager.getGuildDataPublic(
                    interaction.guild.id
                );

            const isPlaying =
                guildData &&
                guildData.current === track;

            if (isPlaying) {
                return interaction.editReply(
                    `🎵 Now playing **${track.title}**`
                );
            }

            return interaction.editReply(
                `🎵 Added **${track.title}** to the queue.`
            );

        } catch (error) {
            console.error(
                "[Music] Play command error:",
                error
            );

            let message =
                "❌ I couldn't play that YouTube video.";

            const errorText =
                String(
                    error?.message || error
                );

            if (
                errorText.includes(
                    "Sign in to confirm"
                )
            ) {
                message =
                    "❌ YouTube is asking for verification for that video.";
            } else if (
                errorText.includes(
                    "No video formats found"
                )
            ) {
                message =
                    "❌ YouTube didn't provide a playable audio format for that video.";
            }

            return interaction.editReply(
                message
            );
        }
    }
};