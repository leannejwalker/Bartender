const {
    SlashCommandBuilder
} = require("discord.js");

const musicManager =
    require("../../music/MusicManager");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("shuffle")
        .setDescription(
            "Shuffle the music queue"
        ),

    async execute(interaction) {
        musicManager.shuffle(
            interaction.guild.id
        );

        await interaction.reply(
            "🔀 Queue shuffled."
        );
    }
};