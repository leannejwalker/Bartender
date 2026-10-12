const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    StreamType,
    NoSubscriberBehavior,
    entersState
} = require("@discordjs/voice");

const { spawn } = require("child_process");

const YTDLP_PATH = "/usr/local/bin/yt-dlp";
const FFMPEG_PATH = "/usr/bin/ffmpeg";

const YOUTUBE_COOKIES =
    "/home/bartenderadmin/Bartender/cookies/youtube.txt";

const NODE_PATH =
    "/home/bartenderadmin/.nvm/versions/node/v24.21.0/bin/node";

const YTDLP_COMMON_ARGS = [
    "--cookies",
    YOUTUBE_COOKIES,
    "--js-runtimes",
    `node:${NODE_PATH}`,
    "--extractor-args",
    "youtube:player-client=mweb;po_token=web.gvs+bgutil:http",
    "--no-warnings",
    "--no-playlist"
];

class GuildMusic {
    constructor(guildId) {
        this.guildId = guildId;

        this.connection = null;

        this.player = createAudioPlayer({
            behaviors: {
                noSubscriber:
                    NoSubscriberBehavior.Pause
            }
        });

        this.queue = [];
        this.current = null;

        this.volume = 1;
        this.loop = false;

        this.textChannel = null;

        this.ffmpegProcess = null;
        this.currentResource = null;

        this.startingPlayback = false;
        this.disconnecting = false;

        this.player.on(
            AudioPlayerStatus.Idle,
            () => {
                void this.handleIdle();
            }
        );

        this.player.on("error", error => {
            console.error(
                `[Music:${this.guildId}] Player error:`,
                error
            );

            /*
             * Stopping the player transitions it to Idle.
             * The Idle handler safely advances the queue.
             */
            this.killFFmpeg();
            this.player.stop(true);
        });
    }

    async connect(channel) {
        if (!channel?.id || !channel?.guild) {
            throw new Error(
                "A valid Discord voice channel is required."
            );
        }

        const existingChannelId =
            this.connection?.joinConfig?.channelId;

        const connectionIsUsable =
            this.connection &&
            this.connection.state.status !==
                VoiceConnectionStatus.Destroyed;

        if (
            connectionIsUsable &&
            existingChannelId === channel.id
        ) {
            await entersState(
                this.connection,
                VoiceConnectionStatus.Ready,
                30_000
            );

            return this.connection;
        }

        if (connectionIsUsable) {
            this.connection.destroy();
            this.connection = null;
        }

        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator:
                channel.guild.voiceAdapterCreator,
            selfDeaf: true,
            selfMute: false
        });

        this.connection = connection;
        connection.subscribe(this.player);

        try {
            await entersState(
                connection,
                VoiceConnectionStatus.Ready,
                30_000
            );

            return connection;
        } catch (error) {
            if (
                connection.state.status !==
                VoiceConnectionStatus.Destroyed
            ) {
                connection.destroy();
            }

            if (this.connection === connection) {
                this.connection = null;
            }

            throw new Error(
                `Could not connect to the voice channel: ${
                    error?.message || error
                }`
            );
        }
    }

    async disconnect() {
        this.disconnecting = true;

        this.queue = [];
        this.current = null;
        this.textChannel = null;

        this.killFFmpeg();
        this.currentResource = null;

        this.player.stop(true);

        if (this.connection) {
            if (
                this.connection.state.status !==
                VoiceConnectionStatus.Destroyed
            ) {
                this.connection.destroy();
            }

            this.connection = null;
        }

        this.disconnecting = false;
    }

    async add(track) {
        if (!track?.url) {
            throw new Error(
                "Cannot add a track without a URL."
            );
        }

        this.queue.push(track);

        if (
            !this.current &&
            this.player.state.status ===
                AudioPlayerStatus.Idle
        ) {
            await this.playNext();
        }
    }

    async handleIdle() {
        this.killFFmpeg();
        this.currentResource = null;

        if (this.disconnecting) {
            return;
        }

        /*
         * Reinsert the completed track at the beginning
         * when single-track looping is enabled.
         */
        if (this.loop && this.current) {
            this.queue.unshift(this.current);
        }

        this.current = null;

        await this.playNext();
    }

    async playNext() {
        if (this.startingPlayback) {
            return false;
        }

        if (this.current) {
            return false;
        }

        const nextTrack = this.queue.shift();

        if (!nextTrack) {
            return false;
        }

        this.startingPlayback = true;
        this.current = nextTrack;

        try {
            const audioUrl =
                await this.getAudioUrl(
                    nextTrack.url
                );

            /*
             * The track may have been stopped while
             * yt-dlp was resolving the audio URL.
             */
            if (this.current !== nextTrack) {
                return false;
            }

            this.killFFmpeg();

            const ffmpeg = spawn(
                FFMPEG_PATH,
                [
                    "-hide_banner",
                    "-loglevel",
                    "error",

                    "-reconnect",
                    "1",
                    "-reconnect_streamed",
                    "1",
                    "-reconnect_delay_max",
                    "5",

                    "-i",
                    audioUrl,

                    "-vn",
                    "-acodec",
                    "pcm_s16le",
                    "-f",
                    "s16le",
                    "-ar",
                    "48000",
                    "-ac",
                    "2",

                    "pipe:1"
                ],
                {
                    stdio: [
                        "ignore",
                        "pipe",
                        "pipe"
                    ]
                }
            );

            this.ffmpegProcess = ffmpeg;

            ffmpeg.stderr.setEncoding("utf8");

            ffmpeg.stderr.on(
                "data",
                message => {
                    const text =
                        message.trim();

                    if (text) {
                        console.error(
                            `[Music:${this.guildId}] FFmpeg:`,
                            text
                        );
                    }
                }
            );

            ffmpeg.once("error", error => {
                console.error(
                    `[Music:${this.guildId}] FFmpeg error:`,
                    error
                );

                if (
                    this.ffmpegProcess === ffmpeg
                ) {
                    this.ffmpegProcess = null;
                }

                this.player.stop(true);
            });

            ffmpeg.once("close", code => {
                if (
                    this.ffmpegProcess === ffmpeg
                ) {
                    this.ffmpegProcess = null;
                }

                if (
                    code !== 0 &&
                    code !== null &&
                    this.current === nextTrack
                ) {
                    console.error(
                        `[Music:${this.guildId}] FFmpeg exited with code ${code}`
                    );
                }
            });

            const resource =
                createAudioResource(
                    ffmpeg.stdout,
                    {
                        inputType:
                            StreamType.Raw,
                        inlineVolume: true,
                        metadata: nextTrack
                    }
                );

            resource.volume.setVolume(
                this.volume
            );

            this.currentResource = resource;
            this.player.play(resource);

            return true;
        } catch (error) {
            console.error(
                `[Music:${this.guildId}] Could not play track:`,
                error
            );

            this.killFFmpeg();
            this.currentResource = null;

            if (this.current === nextTrack) {
                this.current = null;
            }

            return this.playNext();
        } finally {
            this.startingPlayback = false;
        }
    }

    async getAudioUrl(url) {
        return new Promise(
            (resolve, reject) => {
                const args = [
                    ...YTDLP_COMMON_ARGS,
                    "-f",
                    "bestaudio/best",
                    "--get-url",
                    url
                ];

                const ytDlp = spawn(
                    YTDLP_PATH,
                    args,
                    {
                        stdio: [
                            "ignore",
                            "pipe",
                            "pipe"
                        ]
                    }
                );

                let stdout = "";
                let stderr = "";
                let settled = false;

                ytDlp.stdout.setEncoding(
                    "utf8"
                );

                ytDlp.stderr.setEncoding(
                    "utf8"
                );

                const succeed = value => {
                    if (settled) {
                        return;
                    }

                    settled = true;
                    resolve(value);
                };

                const fail = error => {
                    if (settled) {
                        return;
                    }

                    settled = true;
                    reject(error);
                };

                ytDlp.stdout.on(
                    "data",
                    chunk => {
                        stdout += chunk;
                    }
                );

                ytDlp.stderr.on(
                    "data",
                    chunk => {
                        stderr += chunk;
                    }
                );

                ytDlp.once(
                    "error",
                    fail
                );

                ytDlp.once(
                    "close",
                    code => {
                        if (code !== 0) {
                            fail(
                                new Error(
                                    stderr.trim() ||
                                    `yt-dlp exited with code ${code}`
                                )
                            );

                            return;
                        }

                        const urls = stdout
                            .trim()
                            .split(/\r?\n/)
                            .map(value =>
                                value.trim()
                            )
                            .filter(Boolean);

                        const audioUrl =
                            urls.at(-1);

                        if (!audioUrl) {
                            fail(
                                new Error(
                                    "yt-dlp returned no audio URL."
                                )
                            );

                            return;
                        }

                        succeed(audioUrl);
                    }
                );
            }
        );
    }

    killFFmpeg() {
        const ffmpeg =
            this.ffmpegProcess;

        this.ffmpegProcess = null;

        if (
            ffmpeg &&
            ffmpeg.exitCode === null &&
            !ffmpeg.killed
        ) {
            ffmpeg.kill("SIGKILL");
        }
    }

    pause() {
        return this.player.pause();
    }

    resume() {
        return this.player.unpause();
    }

    skip() {
        if (!this.current) {
            return false;
        }

        /*
         * Prevent the skipped track from being reinserted
         * when loop is enabled.
         */
        this.current = null;

        this.killFFmpeg();

        return this.player.stop(true);
    }

    stop() {
        this.queue = [];
        this.current = null;

        this.killFFmpeg();
        this.currentResource = null;

        return this.player.stop(true);
    }

    setVolume(volume) {
        const parsedVolume =
            Number(volume);

        if (
            !Number.isFinite(parsedVolume)
        ) {
            throw new TypeError(
                "Volume must be a valid number."
            );
        }

        this.volume = Math.max(
            0,
            Math.min(2, parsedVolume)
        );

        if (
            this.currentResource?.volume
        ) {
            this.currentResource.volume
                .setVolume(this.volume);
        }

        return this.volume;
    }

    toggleLoop() {
        this.loop = !this.loop;
        return this.loop;
    }

    shuffle() {
        for (
            let index =
                this.queue.length - 1;
            index > 0;
            index--
        ) {
            const randomIndex =
                Math.floor(
                    Math.random() *
                    (index + 1)
                );

            [
                this.queue[index],
                this.queue[randomIndex]
            ] = [
                this.queue[randomIndex],
                this.queue[index]
            ];
        }

        return this.queue;
    }

    clearQueue() {
        const removedCount =
            this.queue.length;

        this.queue = [];

        return removedCount;
    }

    getData() {
        const positionMs =
            this.currentResource?.playbackDuration ?? 0;

        return {
            queue: [...this.queue],
            current: this.current,
            position: this.current
                ? positionMs / 1000
                : 0,
            volume: this.volume,
            loop: this.loop,
            textChannel: this.textChannel,
            connection: this.connection,
            playerStatus:
                this.player.state.status
        };
    }
}

class MusicManager {
    constructor() {
        this.guilds = new Map();
    }

    get(guildId) {
        if (!guildId) {
            throw new Error(
                "A guild ID is required."
            );
        }

        if (!this.guilds.has(guildId)) {
            this.guilds.set(
                guildId,
                new GuildMusic(guildId)
            );
        }

        return this.guilds.get(guildId);
    }

    getExisting(guildId) {
        return (
            this.guilds.get(guildId) ||
            null
        );
    }

    getGuildData(guildId) {
        const music =
            this.getExisting(guildId);

        if (!music) {
            return {
                queue: [],
                current: null,
                position: 0,
                volume: 1,
                loop: false,
                textChannel: null,
                connection: null,
                playerStatus:
                    AudioPlayerStatus.Idle
            };
        }

        return music.getData();
    }

    getGuildDataPublic(guildId) {
        return this.getGuildData(guildId);
    }

    connect(guildId, channel) {
        return this
            .get(guildId)
            .connect(channel);
    }

    async disconnect(guildId) {
        const music =
            this.getExisting(guildId);

        if (!music) {
            return;
        }

        await music.disconnect();
        this.guilds.delete(guildId);
    }

    setTextChannel(guildId, channel) {
        this.get(guildId).textChannel =
            channel;
    }

    add(guildId, track) {
        return this
            .get(guildId)
            .add(track);
    }

    playNext(guildId) {
        return this
            .get(guildId)
            .playNext();
    }

    pause(guildId) {
        return this
            .get(guildId)
            .pause();
    }

    resume(guildId) {
        return this
            .get(guildId)
            .resume();
    }

    skip(guildId) {
        return this
            .get(guildId)
            .skip();
    }

    stop(guildId) {
        return this
            .get(guildId)
            .stop();
    }

    setVolume(guildId, volume) {
        return this
            .get(guildId)
            .setVolume(volume);
    }

    toggleLoop(guildId) {
        return this
            .get(guildId)
            .toggleLoop();
    }

    shuffle(guildId) {
        return this
            .get(guildId)
            .shuffle();
    }

    clearQueue(guildId) {
        return this
            .get(guildId)
            .clearQueue();
    }

    async remove(guildId) {
        await this.disconnect(guildId);
    }
}

const musicManager =
    new MusicManager();

musicManager.YTDLP_COMMON_ARGS =
    Object.freeze([
        ...YTDLP_COMMON_ARGS
    ]);

module.exports = musicManager;
