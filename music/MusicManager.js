const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
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
    "--no-warnings"
];

class GuildMusic {
    constructor(guildId) {
        this.guildId = guildId;

        this.connection = null;
        this.player = createAudioPlayer();

        this.queue = [];
        this.current = null;

        this.volume = 1;
        this.loop = false;

        this.player.on(
            AudioPlayerStatus.Idle,
            () => {
                this.playNext();
            }
        );

        this.player.on(
            "error",
            error => {
                console.error(
                    `[Music:${this.guildId}] Player error:`,
                    error
                );

                this.playNext();
            }
        );
    }

    async connect(channel) {
        if (
            this.connection &&
            this.connection.state.status !==
                VoiceConnectionStatus.Destroyed
        ) {
            return this.connection;
        }

        this.connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator:
                channel.guild.voiceAdapterCreator,
            selfDeaf: true
        });

        this.connection.subscribe(
            this.player
        );

        await entersState(
            this.connection,
            VoiceConnectionStatus.Ready,
            30_000
        );

        return this.connection;
    }

    async disconnect() {
        this.queue = [];
        this.current = null;

        this.player.stop();

        if (this.connection) {
            this.connection.destroy();
            this.connection = null;
        }
    }

    add(track) {
        this.queue.push(track);

        if (!this.current) {
            this.playNext();
        }
    }

    async playNext() {
        if (this.queue.length === 0) {
            if (
                this.loop &&
                this.current
            ) {
                this.queue.push(
                    this.current
                );
            } else {
                this.current = null;
                return;
            }
        }

        this.current =
            this.queue.shift();

        try {
            const audioUrl =
                await this.getAudioUrl(
                    this.current.url
                );

            const ffmpeg = spawn(
                FFMPEG_PATH,
                [
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-i",
                    audioUrl,
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

            ffmpeg.stderr.on(
                "data",
                data => {
                    const message =
                        data
                            .toString()
                            .trim();

                    if (message) {
                        console.error(
                            `[Music:${this.guildId}] FFmpeg:`,
                            message
                        );
                    }
                }
            );

            ffmpeg.on(
                "error",
                error => {
                    console.error(
                        `[Music:${this.guildId}] FFmpeg error:`,
                        error
                    );

                    this.playNext();
                }
            );

            const resource =
                createAudioResource(
                    ffmpeg.stdout,
                    {
                        inputType: 1,
                        inlineVolume: true
                    }
                );

            resource.volume.setVolume(
                this.volume
            );

            this.player.play(resource);
        } catch (error) {
            console.error(
                `[Music:${this.guildId}] Could not play track:`,
                error
            );

            this.playNext();
        }
    }

    async getAudioUrl(url) {
        return new Promise(
            (
                resolve,
                reject
            ) => {
                const args = [
                    ...YTDLP_COMMON_ARGS,
                    "-f",
                    "bestaudio/best",
                    "-g",
                    url
                ];

                const process =
                    spawn(
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

                process.stdout.on(
                    "data",
                    data => {
                        stdout +=
                            data.toString();
                    }
                );

                process.stderr.on(
                    "data",
                    data => {
                        stderr +=
                            data.toString();
                    }
                );

                process.on(
                    "error",
                    error => {
                        reject(error);
                    }
                );

                process.on(
                    "close",
                    code => {
                        if (
                            code !== 0
                        ) {
                            reject(
                                new Error(
                                    stderr ||
                                        `yt-dlp exited with code ${code}`
                                )
                            );

                            return;
                        }

                        const audioUrl =
                            stdout
                                .trim()
                                .split("\n")
                                .pop();

                        if (
                            !audioUrl
                        ) {
                            reject(
                                new Error(
                                    "yt-dlp returned no audio URL"
                                )
                            );

                            return;
                        }

                        resolve(
                            audioUrl
                        );
                    }
                );
            }
        );
    }

    pause() {
        return this.player.pause();
    }

    resume() {
        return this.player.unpause();
    }

    skip() {
        this.player.stop();
    }

    stop() {
        this.queue = [];
        this.current = null;

        this.player.stop();
    }

    setVolume(volume) {
        this.volume =
            Math.max(
                0,
                Math.min(
                    2,
                    volume
                )
            );
    }

    toggleLoop() {
        this.loop = !this.loop;
        return this.loop;
    }

    shuffle() {
        for (
            let i =
                this.queue.length - 1;
            i > 0;
            i--
        ) {
            const j =
                Math.floor(
                    Math.random() *
                        (i + 1)
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

    clearQueue() {
        this.queue = [];
    }
}

class MusicManager {
    constructor() {
        this.guilds =
            new Map();
    }

    get(guildId) {
        if (
            !this.guilds.has(
                guildId
            )
        ) {
            this.guilds.set(
                guildId,
                new GuildMusic(
                    guildId
                )
            );
        }

        return this.guilds.get(
            guildId
        );
    }

    remove(guildId) {
        const music =
            this.guilds.get(
                guildId
            );

        if (music) {
            music.disconnect();

            this.guilds.delete(
                guildId
            );
        }
    }
}
const musicManager = new MusicManager();

musicManager.YTDLP_COMMON_ARGS = YTDLP_COMMON_ARGS;

module.exports = musicManager;