const { SlashCommandBuilder } = require("discord.js");
const musicManager = require("../../music/MusicManager");
module.exports = {
    data: new SlashCommandBuilder().setName("join").setDescription("Join your current voice channel"),
    async execute(interaction) {
        const channel = interaction.member?.voice?.channel;
        if (!channel) return interaction.reply({ content: "Join a voice channel first.", ephemeral: true });
        try {
            await musicManager.connect(interaction.guildId, channel);
            musicManager.setTextChannel(interaction.guildId, interaction.channel);
            return interaction.reply(`Joined **${channel.name}**.`);
        } catch (error) {
            console.error("[Music] Join error:", error);
            return interaction.reply({ content: `Could not join: ${error.message}`, ephemeral: true });
        }
    }
};
