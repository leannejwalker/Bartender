const {
    SlashCommandBuilder
} = require("discord.js");

const musicManager =
    require("../../music/MusicManager");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("stop")
        .setDescription(
            "Stop music and clear the queue"
        ),

    async execute(interaction) {
        musicManager.stop(
            interaction.guild.id
        );

        await interaction.reply(
            "🛑 Music stopped and the queue was cleared."
        );
    }
};