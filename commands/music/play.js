const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const play = require("play-dl");
const MusicManager = require("../../music/MusicManager");

module.exports = {
    category: "Music",

    data: new SlashCommandBuilder()
        .setName("play")
        .setDescription("Play a YouTube video or search for a song")
        .addStringOption(option =>
            option
                .setName("query")
                .setDescription("YouTube URL or song name")
                .setRequired(true)
        ),

    async execute(interaction) {
        const voiceChannel =
            interaction.member.voice.channel;

        if (!voiceChannel) {
            return interaction.reply({
                content:
                    "❌ You need to be in a voice channel first.",
                ephemeral: true
            });
        }

        const query =
            interaction.options.getString("query");

        await interaction.deferReply();

        try {
            let video;

            if (play.yt_validate(query) === "video") {
                const info =
                    await play.video_basic_info(query);

                video = {
                    title: info.video_details.title,
                    url: info.video_details.url,
                    duration:
                        info.video_details.durationRaw,
                    thumbnail:
                        info.video_details.thumbnails?.[0]?.url
                };
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
                        "❌ I couldn't find that song."
                    );
                }

                const result = results[0];

                video = {
                    title: result.title,
                    url: result.url,
                    duration: result.durationRaw,
                    thumbnail:
                        result.thumbnails?.[0]?.url
                };
            }

            const manager =
                MusicManager.get(
                    interaction.guild.id
                );

            manager.join(voiceChannel);

            const playing =
                await manager.add({
                    ...video,
                    requestedBy:
                        interaction.user.id
                });

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle(
                    playing
                        ? "🎵 Now Playing"
                        : "🎵 Added to Queue"
                )
                .setDescription(
                    `[${video.title}](${video.url})`
                )
                .addFields({
                    name: "Requested by",
                    value: `<@${interaction.user.id}>`,
                    inline: true
                });

            if (video.duration) {
                embed.addFields({
                    name: "Duration",
                    value: video.duration,
                    inline: true
                });
            }

            if (video.thumbnail) {
                embed.setThumbnail(
                    video.thumbnail
                );
            }

            embed.setFooter({
                text: "After Hours • Bartender"
            });

            await interaction.editReply({
                embeds: [embed]
            });
        } catch (error) {
            console.error(
                "Play command error:",
                error
            );

            await interaction.editReply(
                "❌ I couldn't play that track."
            );
        }
    }
};