const {
    SlashCommandBuilder
} = require("discord.js");

const musicManager = require("../../music/MusicManager");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("volume")
        .setDescription("Set the music volume")
        .addIntegerOption(option =>
            option
                .setName("volume")
                .setDescription("Volume percentage (0-200)")
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(200)
        ),

    async execute(interaction) {
        const percentage =
            interaction.options.getInteger("volume");

        const volume = percentage / 100;

        musicManager.setVolume(
            interaction.guildId,
            volume
        );

        let icon = "🔊";

        if (percentage === 0) {
            icon = "🔇";
        } else if (percentage < 50) {
            icon = "🔈";
        } else if (percentage < 100) {
            icon = "🔉";
        }

        await interaction.reply({
            content: `${icon} Volume set to **${percentage}%**.`
        });
    }
};