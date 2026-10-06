const {
    SlashCommandBuilder
} = require("discord.js");

const musicManager =
    require("../../music/MusicManager");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("resume")
        .setDescription(
            "Resume the current song"
        ),

    async execute(interaction) {
        const success =
            musicManager.resume(
                interaction.guild.id
            );

        if (!success) {
            return interaction.reply(
                "❌ Nothing is paused."
            );
        }

        await interaction.reply(
            "▶️ Resumed."
        );
    }
};