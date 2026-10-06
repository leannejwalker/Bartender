const {
    SlashCommandBuilder
} = require("discord.js");

const musicManager =
    require("../../music/MusicManager");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("loop")
        .setDescription(
            "Toggle looping of the current song"
        ),

    async execute(interaction) {
        const enabled =
            musicManager.toggleLoop(
                interaction.guild.id
            );

        await interaction.reply(
            enabled
                ? "🔁 Loop enabled."
                : "➡️ Loop disabled."
        );
    }
};