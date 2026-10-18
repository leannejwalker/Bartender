const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const musicManager = require("../../dependencies/MusicManager");

function formatTime(seconds) {
    seconds = Math.floor(Math.max(0, Number(seconds) || 0));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return hours > 0
        ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
        : `${minutes}:${String(secs).padStart(2, "0")}`;
}

function validUrl(value) {
    try { return ["http:", "https:"].includes(new URL(value).protocol); }
    catch { return false; }
}

function buildNowPlayingEmbed(data) {
    const track = data.current;
    const position = Math.max(0, Number(data.position) || 0);
    const duration = Math.max(0, Number(track.durationInSec) || 0);
    const percent = duration ? Math.min(100, Math.round(position / duration * 100)) : 0;
    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setAuthor({ name: "NOW PLAYING" })
        .setTitle(track.title || "Unknown Track")
        .setDescription([
            `${formatTime(position)} / ${duration ? formatTime(duration) : "Live or unknown"}`,
            `${percent}% complete`,
            `Channel: ${track.channel || "YouTube"}`,
            `Requested by: ${track.requestedBy || "Unknown"}`,
            `${data.queue.length} track(s) waiting`
        ].join("\n"));
    if (validUrl(track.url)) embed.setURL(track.url);
    if (validUrl(track.thumbnail)) embed.setThumbnail(track.thumbnail);
    return embed;
}

module.exports = {
    data: new SlashCommandBuilder().setName("nowplaying").setDescription("Show the current track"),
    buildNowPlayingEmbed,
    async execute(interaction) {
        const data = musicManager.getGuildDataPublic(interaction.guildId);
        if (!data.current) {
            return interaction.reply({ content: "Nothing is currently playing.", ephemeral: true });
        }
        return interaction.reply({ embeds: [buildNowPlayingEmbed(data)] });
    }
};
