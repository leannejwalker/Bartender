const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    NoSubscriberBehavior,
    StreamType
} = require("@discordjs/voice");

const play = require("play-dl");

class MusicManager {
    constructor() {
        this.guilds = new Map();
    }

    get(guildId) {
        if (!this.guilds.has(guildId)) {
            const player = createAudioPlayer({
                behaviors: {
                    noSubscriber: NoSubscriberBehavior.Pause
                }
            });

            const data = {
                queue: [],
                player,
                connection: null,
                current: null,
                volume: 0.8,
                loop: false,
                textChannel: null,
                nowPlayingMessage: null,
                progressInterval: null
            };

            player.on(AudioPlayerStatus.Idle, async () => {
                if (data.loop && data.current) {
                    await this.playCurrent(guildId);
                    return;
                }

                data.current = null;

                if (data.queue.length > 0) {
                    data.current = data.queue.shift();
                    await this.playCurrent(guildId);
                } else {
                    this.stopProgress(guildId);
                }
            });

            player.on("error", error => {
                console.error("Music player error:", error);

                data.current = null;

                if (data.queue.length > 0) {
                    data.current = data.queue.shift();
                    this.playCurrent(guildId).catch(console.error);
                }
            });

            this.guilds.set(guildId, data);
        }

        return this.guilds.get(guildId);
    }

    async connect(guild, channel) {
        const data = this.get(guild.id);

        data.connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: true
        });

        data.connection.subscribe(data.player);

        return data;
    }

    async add(guild, track) {
        const data = this.get(guild.id);

        data.queue.push(track);

        if (!data.current) {
            data.current = data.queue.shift();
            await this.playCurrent(guild.id);
        }

        return data;
    }

    async playCurrent(guildId) {
        const data = this.get(guildId);

        if (!data.current) return;

        const stream = await play.stream(data.current.url);

        const resource = createAudioResource(stream.stream, {
            inputType:
                stream.type === "opus"
                    ? StreamType.Opus
                    : StreamType.WebmOpus,
            inlineVolume: true
        });

        resource.volume.setVolume(data.volume);

        data.player.play(resource);

        this.startProgress(guildId);
    }

    pause(guildId) {
        const data = this.get(guildId);
        return data.player.pause();
    }

    resume(guildId) {
        const data = this.get(guildId);
        return data.player.unpause();
    }

    async skip(guildId) {
        const data = this.get(guildId);

        if (!data.current) return;

        data.player.stop();
    }

    stop(guildId) {
        const data = this.get(guildId);

        data.queue = [];
        data.current = null;
        data.loop = false;

        data.player.stop();

        this.stopProgress(guildId);
    }

    setVolume(guildId, volume) {
        const data = this.get(guildId);

        data.volume = Math.max(0, Math.min(1, volume));

        return data.volume;
    }

    toggleLoop(guildId) {
        const data = this.get(guildId);

        data.loop = !data.loop;

        return data.loop;
    }

    shuffle(guildId) {
        const data = this.get(guildId);

        for (let i = data.queue.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));

            [data.queue[i], data.queue[j]] =
                [data.queue[j], data.queue[i]];
        }
    }

    clear(guildId) {
        const data = this.get(guildId);
        data.queue = [];
    }

    getPosition(guildId) {
        const data = this.get(guildId);

        if (!data.current) return 0;

        const state = data.player.state;

        if (!state.resource) return 0;

        return state.resource.playbackDuration || 0;
    }

    startProgress(guildId) {
        const data = this.get(guildId);

        this.stopProgress(guildId);

        data.progressInterval = setInterval(async () => {
            if (!data.nowPlayingMessage || !data.current) {
                return;
            }

            try {
                const { buildNowPlayingEmbed } =
                    require("../commands/music/nowplaying");

                const embed = buildNowPlayingEmbed(guildId);

                await data.nowPlayingMessage.edit({
                    embeds: [embed]
                });
            } catch (error) {
                console.error("Now playing update error:", error);
            }
        }, 10000);
    }

    stopProgress(guildId) {
        const data = this.get(guildId);

        if (data.progressInterval) {
            clearInterval(data.progressInterval);
            data.progressInterval = null;
        }
    }

    leave(guildId) {
        const data = this.get(guildId);

        this.stop(guildId);

        if (data.connection) {
            data.connection.destroy();
            data.connection = null;
        }

        this.guilds.delete(guildId);
    }
}

module.exports = new MusicManager();