const {
    SlashCommandBuilder
} = require("discord.js");

const musicManager =
    require("../../dependencies/MusicManager");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("pause")
        .setDescription(
            "Pause the current song"
        ),

    async execute(interaction) {
        const success =
            musicManager.pause(
                interaction.guild.id
            );

        if (!success) {
            return interaction.reply(
                "❌ Nothing is currently playing."
            );
        }

        await interaction.reply(
            "⏸️ Paused."
        );
    }
};