const {
    SlashCommandBuilder
} = require("discord.js");

const musicManager =
    require("../../music/MusicManager");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("clear")
        .setDescription(
            "Clear the music queue"
        ),

    async execute(interaction) {
        musicManager.clear(
            interaction.guild.id
        );

        await interaction.reply(
            "🧹 Music queue cleared."
        );
    }
};