const {
    SlashCommandBuilder
} = require("discord.js");

const musicManager =
    require("../../music/MusicManager");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("volume")
        .setDescription(
            "Set music volume"
        )
        .addIntegerOption(option =>
            option
                .setName("level")
                .setDescription(
                    "Volume from 0 to 100"
                )
                .setMinValue(0)
                .setMaxValue(100)
                .setRequired(true)
        ),

    async execute(interaction) {
        const level =
            interaction.options.getInteger(
                "level"
            );

        const volume =
            musicManager.setVolume(
                interaction.guild.id,
                level / 100
            );

        await interaction.reply(
            `🔊 Volume set to **${Math.round(
                volume * 100
            )}%**.`
        );
    }
};