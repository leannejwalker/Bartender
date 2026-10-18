const { SlashCommandBuilder } = require("discord.js");
const { spawn } = require("child_process");
const musicManager = require("../../music/MusicManager");

function runYtDlp(args) {
    return new Promise((resolve, reject) => {
        const process = spawn(musicManager.YTDLP_PATH, args, {
            stdio: ["ignore", "pipe", "pipe"]
        });
        let stdout = "";
        let stderr = "";
        process.stdout.setEncoding("utf8");
        process.stderr.setEncoding("utf8");
        process.stdout.on("data", chunk => { stdout += chunk; });
        process.stderr.on("data", chunk => { stderr += chunk; });
        process.once("error", reject);
        process.once("close", code => {
            if (code !== 0) {
                reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
            } else {
                resolve(stdout);
            }
        });
    });
}

function isYouTubeUrl(value) {
    try {
        const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
        return ["youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"].includes(hostname);
    } catch { return false; }
}

function videoUrl(info) {
    if (typeof info?.webpage_url === "string" && info.webpage_url) return info.webpage_url;
    if (typeof info?.original_url === "string" && isYouTubeUrl(info.original_url)) return info.original_url;
    return info?.id ? `https://www.youtube.com/watch?v=${info.id}` : null;
}

async function getVideoInfo(query) {
    const target = isYouTubeUrl(query) ? query : `ytsearch1:${query}`;
    const output = await runYtDlp([
        ...musicManager.getYtDlpCommonArgs(),
        "--dump-single-json",
        "--flat-playlist",
        target
    ]);
    const data = JSON.parse(output);
    const info = Array.isArray(data.entries) ? data.entries[0] : data;
    if (!info) throw new Error("No YouTube results were found.");

    const url = videoUrl(info);
    if (!url) throw new Error("YouTube returned no usable video URL.");

    const detailedOutput = await runYtDlp([
        ...musicManager.getYtDlpCommonArgs(),
        "--dump-single-json",
        "--skip-download",
        url
    ]);
    return JSON.parse(detailedOutput);
}

function clean(value, fallback, max) {
    if (typeof value !== "string" || !value.trim()) return fallback;
    return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function escapeMarkdown(value) {
    return String(value).replace(/([\\`*_{}\[\]()#+\-.!|>~])/g, "\\$1");
}

function safeError(error) {
    const text = String(error?.message || error).toLowerCase();
    if (text.includes("sign in to confirm") || text.includes("not a bot")) {
        return "YouTube blocked the server request. Refresh the cookies file and update yt-dlp.";
    }
    if (text.includes("private video")) return "That video is private.";
    if (text.includes("video unavailable")) return "That video is unavailable.";
    if (text.includes("no youtube results")) return "No YouTube results were found.";
    return "The track could not be loaded. Check the bot console for the yt-dlp error.";
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("play")
        .setDescription("Play a YouTube song or resume playback")
        .addStringOption(option => option
            .setName("query")
            .setDescription("YouTube URL or song name")
            .setMaxLength(200)
            .setRequired(false)),

    async execute(interaction) {
        if (!interaction.guildId) {
            return interaction.reply({ content: "This command only works in a server.", ephemeral: true });
        }
        const voiceChannel = interaction.member?.voice?.channel;
        if (!voiceChannel) {
            return interaction.reply({ content: "Join a voice channel first.", ephemeral: true });
        }

        const query = interaction.options.getString("query")?.trim();
        if (!query) {
            const data = musicManager.getGuildData(interaction.guildId);
            if (!data.current) {
                return interaction.reply({ content: "Nothing is paused or queued.", ephemeral: true });
            }
            await musicManager.connect(interaction.guildId, voiceChannel);
            const resumed = musicManager.resume(interaction.guildId);
            return interaction.reply(resumed ? "Resumed playback." : "The track is already playing.");
        }

        await interaction.deferReply();
        try {
            const info = await getVideoInfo(query);
            const url = videoUrl(info);
            const track = {
                title: clean(info.title, "Unknown Track", 200),
                url,
                durationInSec: Number.isFinite(Number(info.duration)) ? Number(info.duration) : 0,
                thumbnail: typeof info.thumbnail === "string" ? info.thumbnail : null,
                channel: clean(info.uploader || info.channel, "YouTube", 100),
                requestedBy: interaction.user.toString()
            };

            const before = musicManager.getGuildData(interaction.guildId);
            await musicManager.connect(interaction.guildId, voiceChannel);
            musicManager.setTextChannel(interaction.guildId, interaction.channel);
            await musicManager.add(interaction.guildId, track);

            const title = escapeMarkdown(track.title);
            await interaction.editReply(before.current
                ? `Added **${title}** to the queue.`
                : `Now playing **${title}**`);
        } catch (error) {
            console.error("[Music] Play command error:", error);
            await interaction.editReply(`Could not play: ${safeError(error)}`);
        }
    }
};
