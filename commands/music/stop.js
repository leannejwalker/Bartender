const {
    SlashCommandBuilder
} = require("discord.js");

const musicManager =
    require("../../music/MusicManager");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("stop")
        .setDescription(
            "Stop the current music without clearing the queue"
        ),

    async execute(interaction) {
        try {
            const data =
                musicManager.getGuildData(
                    interaction.guild.id
                );

            if (!data.current) {
                return interaction.reply({
                    content:
                        "🛑 Nothing is currently playing.",
                    ephemeral: true
                });
            }

            musicManager.stop(
                interaction.guild.id
            );

            await interaction.reply(
                "🛑 Music stopped. The queue has been kept."
            );
        } catch (error) {
            console.error(
                "[Music] Stop command error:",
                error
            );

            await interaction.reply({
                content:
                    `❌ Could not stop the music: ${
                        error?.message || error
                    }`,
                ephemeral: true
            });
        }
    }
};
