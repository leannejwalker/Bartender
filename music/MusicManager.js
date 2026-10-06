const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    NoSubscriberBehavior,
    StreamType,
    entersState,
    VoiceConnectionStatus
} = require("@discordjs/voice");

const play = require("play-dl");

const queues = new Map();

class MusicManager {
    constructor(guildId) {
        this.guildId = guildId;

        this.queue = [];
        this.current = null;

        this.connection = null;
        this.player = createAudioPlayer({
            behaviors: {
                noSubscriber: NoSubscriberBehavior.Play
            }
        });

        this.volume = 100;
        this.loop = false;

        this.player.on(
            AudioPlayerStatus.Idle,
            async () => {
                await this.playNext();
            }
        );

        this.player.on("error", error => {
            console.error(
                `Music player error in ${this.guildId}:`,
                error
            );

            this.playNext();
        });
    }

    static get(guildId) {
        if (!queues.has(guildId)) {
            queues.set(
                guildId,
                new MusicManager(guildId)
            );
        }

        return queues.get(guildId);
    }

    join(channel) {
        this.connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator:
                channel.guild.voiceAdapterCreator,
            selfDeaf: true
        });

        this.connection.subscribe(this.player);

        this.connection.on(
            VoiceConnectionStatus.Disconnected,
            async () => {
                try {
                    await Promise.race([
                        entersState(
                            this.connection,
                            VoiceConnectionStatus.Signalling,
                            5_000
                        ),
                        entersState(
                            this.connection,
                            VoiceConnectionStatus.Connecting,
                            5_000
                        )
                    ]);
                } catch {
                    this.leave();
                }
            }
        );

        return this.connection;
    }

    async add(track) {
        this.queue.push(track);

        if (!this.current) {
            await this.playNext();
            return true;
        }

        return false;
    }

    async playNext() {
        if (this.loop && this.current) {
            await this.playTrack(this.current);
            return;
        }

        const next = this.queue.shift();

        if (!next) {
            this.current = null;
            return;
        }

        this.current = next;

        await this.playTrack(next);
    }

    async playTrack(track) {
        try {
            const stream = await play.stream(
                track.url,
                {
                    quality: 2,
                    discordPlayerCompatibility: false
                }
            );

            const resource = createAudioResource(
                stream.stream,
                {
                    inputType:
                        stream.type === "opus"
                            ? StreamType.Opus
                            : StreamType.WebmOpus,
                    inlineVolume: true,
                    metadata: track
                }
            );

            if (resource.volume) {
                resource.volume.setVolume(
                    this.volume / 100
                );
            }

            this.player.play(resource);
        } catch (error) {
            console.error(
                `Failed to play ${track.title}:`,
                error
            );

            this.current = null;

            await this.playNext();
        }
    }

    pause() {
        return this.player.pause();
    }

    resume() {
        return this.player.unpause();
    }

    skip() {
        return this.player.stop();
    }

    stop() {
        this.queue = [];
        this.current = null;
        this.loop = false;

        return this.player.stop();
    }

    setVolume(volume) {
        this.volume = volume;

        const resource =
            this.player.state.resource;

        if (resource?.volume) {
            resource.volume.setVolume(
                volume / 100
            );
        }
    }

    shuffle() {
        for (
            let i = this.queue.length - 1;
            i > 0;
            i--
        ) {
            const j = Math.floor(
                Math.random() * (i + 1)
            );

            [
                this.queue[i],
                this.queue[j]
            ] = [
                this.queue[j],
                this.queue[i]
            ];
        }
    }

    clear() {
        this.queue = [];
    }

    remove(position) {
        if (
            position < 1 ||
            position > this.queue.length
        ) {
            return null;
        }

        return this.queue.splice(
            position - 1,
            1
        )[0];
    }

    leave() {
        this.stop();

        if (this.connection) {
            this.connection.destroy();
            this.connection = null;
        }

        queues.delete(this.guildId);
    }
}

module.exports = MusicManager;