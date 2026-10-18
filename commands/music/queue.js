const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const musicManager = require("../../dependencies/MusicManager");
module.exports = {
    data: new SlashCommandBuilder().setName("queue").setDescription("Show the music queue"),
    async execute(interaction) {
        const data = musicManager.getGuildDataPublic(interaction.guildId);
        if (!data.current && data.queue.length === 0) {
            return interaction.reply({ content: "The music queue is empty.", ephemeral: true });
        }
        const lines = [];
        if (data.current) lines.push(`**Now playing:** ${data.current.title}`, "");
        data.queue.slice(0, 20).forEach((track, index) => lines.push(`**${index + 1}.** ${track.title}`));
        if (data.queue.length > 20) lines.push(`...and ${data.queue.length - 20} more.`);
        if (!data.queue.length) lines.push("No tracks waiting in the queue.");
        const embed = new EmbedBuilder().setColor(0x5865f2).setTitle("Music Queue").setDescription(lines.join("\n"));
        return interaction.reply({ embeds: [embed] });
    }
};
