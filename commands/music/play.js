const {
    SlashCommandBuilder
} = require("discord.js");

const play = require("play-dl");
const musicManager = require("../../music/MusicManager");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("play")
        .setDescription("Play a YouTube song")
        .addStringOption(option =>
            option
                .setName("query")
                .setDescription(
                    "YouTube URL or song name"
                )
                .setRequired(true)
        ),

    async execute(interaction) {
        const query =
            interaction.options.getString(
                "query"
            );

        const voiceChannel =
            interaction.member.voice.channel;

        if (!voiceChannel) {
            return interaction.reply({
                content:
                    "❌ You need to join a voice channel first.",
                ephemeral: true
            });
        }

        await interaction.deferReply();

        try {
            let video;

            if (play.yt_validate(query) === "video") {
                video = await play.video_basic_info(
                    query
                );
            } else {
                const results =
                    await play.search(query, {
                        limit: 1,
                        source: {
                            youtube: "video"
                        }
                    });

                if (!results.length) {
                    return interaction.editReply(
                        "❌ I couldn't find that song on YouTube."
                    );
                }

                video =
                    await play.video_basic_info(
                        results[0].url
                    );
            }

            const track = {
                title: video.video_details.title,
                url: video.video_details.url,
                durationInSec:
                    video.video_details.durationInSec,
                thumbnail:
                    video.video_details.thumbnails?.[0]?.url,
                channel:
                    video.video_details.channel?.name ||
                    "YouTube",
                requestedBy:
                    interaction.user.toString()
            };

            const data =
                await musicManager.connect(
                    interaction.guild,
                    voiceChannel
                );

            data.textChannel =
                interaction.channel;

            await musicManager.add(
                interaction.guild,
                track
            );

            return interaction.editReply(
                `🎵 Added **${track.title}** to the queue.`
            );

        } catch (error) {
            console.error(
                "Play command error:",
                error
            );

            return interaction.editReply(
                "❌ I couldn't play that YouTube video."
            );
        }
    }
};