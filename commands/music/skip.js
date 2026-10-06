const {
    SlashCommandBuilder
} = require("discord.js");

const musicManager =
    require("../../music/MusicManager");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("skip")
        .setDescription(
            "Skip the current song"
        ),

    async execute(interaction) {
        const success =
            await musicManager.skip(
                interaction.guild.id
            );

        if (!success) {
            return interaction.reply(
                "❌ Nothing is currently playing."
            );
        }

        await interaction.reply(
            "⏭️ Skipped."
        );
    }
};