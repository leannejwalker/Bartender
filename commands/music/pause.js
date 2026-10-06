const {
    SlashCommandBuilder
} = require("discord.js");

const MusicManager = require("../../music/MusicManager");

module.exports = {
    category: "Music",

    data: new SlashCommandBuilder()
        .setName("pause")
        .setDescription("Pause the current song"),

    async execute(interaction) {
        const manager =
            MusicManager.get(
                interaction.guild.id
            );

        if (!manager.current) {
            return interaction.reply({
                content: "❌ Nothing is playing.",
                ephemeral: true
            });
        }

        manager.pause();

        await interaction.reply(
            "⏸️ Playback paused."
        );
    }
};