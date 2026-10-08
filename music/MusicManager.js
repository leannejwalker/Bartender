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
        this.textChannel = null;

        this.player.on(AudioPlayerStatus.Idle, () => {
            void this.playNext();
        });

        this.player.on("error", error => {
            console.error(
                `[Music:${this.guildId}] Player error:`,
                error
            );

            void this.playNext();
        });
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
            adapterCreator: channel.guild.voiceAdapterCreator,
            selfDeaf: true
        });

        this.connection.subscribe(this.player);

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
        this.textChannel = null;
        this.player.stop();

        if (this.connection) {
            this.connection.destroy();
            this.connection = null;
        }
    }

    add(track) {
        this.queue.push(track);

        if (!this.current) {
            void this.playNext();
        }
    }

    async playNext() {
        if (this.queue.length === 0) {
            if (this.loop && this.current) {
                this.queue.push(this.current);
            } else {
                this.current = null;
                return;
            }
        }

        this.current = this.queue.shift();

        try {
            const audioUrl = await this.getAudioUrl(
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
                    stdio: ["ignore", "pipe", "pipe"]
                }
            );

            ffmpeg.stderr.on("data", data => {
                const message = data.toString().trim();

                if (message) {
                    console.error(
                        `[Music:${this.guildId}] FFmpeg:`,
                        message
                    );
                }
            });

            ffmpeg.on("error", error => {
                console.error(
                    `[Music:${this.guildId}] FFmpeg error:`,
                    error
                );

                void this.playNext();
            });

            const resource = createAudioResource(
                ffmpeg.stdout,
                {
                    inputType: 1,
                    inlineVolume: true
                }
            );

            resource.volume.setVolume(this.volume);
            this.player.play(resource);
        } catch (error) {
            console.error(
                `[Music:${this.guildId}] Could not play track:`,
                error
            );

            void this.playNext();
        }
    }

    async getAudioUrl(url) {
        return new Promise((resolve, reject) => {
            const args = [
                ...YTDLP_COMMON_ARGS,
                "-f",
                "bestaudio/best",
                "-g",
                url
            ];

            const ytDlp = spawn(
                YTDLP_PATH,
                args,
                {
                    stdio: ["ignore", "pipe", "pipe"]
                }
            );

            let stdout = "";
            let stderr = "";

            ytDlp.stdout.on("data", data => {
                stdout += data.toString();
            });

            ytDlp.stderr.on("data", data => {
                stderr += data.toString();
            });

            ytDlp.on("error", reject);

            ytDlp.on("close", code => {
                if (code !== 0) {
                    reject(
                        new Error(
                            stderr ||
                                `yt-dlp exited with code ${code}`
                        )
                    );
                    return;
                }

                const audioUrl = stdout
                    .trim()
                    .split("\n")
                    .pop();

                if (!audioUrl) {
                    reject(
                        new Error(
                            "yt-dlp returned no audio URL"
                        )
                    );
                    return;
                }

                resolve(audioUrl);
            });
        });
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
        this.volume = Math.max(
            0,
            Math.min(2, volume)
        );
    }

    toggleLoop() {
        this.loop = !this.loop;
        return this.loop;
    }

    shuffle() {
        for (let i = this.queue.length - 1; i > 0; i--) {
            const j = Math.floor(
                Math.random() * (i + 1)
            );

            [this.queue[i], this.queue[j]] =
                [this.queue[j], this.queue[i]];
        }
    }

    clearQueue() {
        this.queue = [];
    }
}

class MusicManager {
    constructor() {
        this.guilds = new Map();
    }

    get(guildId) {
        if (!this.guilds.has(guildId)) {
            this.guilds.set(
                guildId,
                new GuildMusic(guildId)
            );
        }

        return this.guilds.get(guildId);
    }

    getGuildData(guildId) {
        const music = this.get(guildId);

        return {
            queue: music.queue,
            current: music.current,
            volume: music.volume,
            loop: music.loop,
            textChannel: music.textChannel,
            connection: music.connection
        };
    }

    connect(guildId, channel) {
        return this.get(guildId).connect(channel);
    }

    async disconnect(guildId) {
        const music = this.get(guildId);

        await music.disconnect();
        this.guilds.delete(guildId);
    }

    setTextChannel(guildId, channel) {
        this.get(guildId).textChannel = channel;
    }

    add(guildId, track) {
        return this.get(guildId).add(track);
    }

    playNext(guildId) {
        return this.get(guildId).playNext();
    }

    pause(guildId) {
        return this.get(guildId).pause();
    }

    resume(guildId) {
        return this.get(guildId).resume();
    }

    skip(guildId) {
        return this.get(guildId).skip();
    }

    stop(guildId) {
        return this.get(guildId).stop();
    }

    setVolume(guildId, volume) {
        return this.get(guildId).setVolume(volume);
    }

    toggleLoop(guildId) {
        return this.get(guildId).toggleLoop();
    }

    shuffle(guildId) {
        return this.get(guildId).shuffle();
    }

    clearQueue(guildId) {
        return this.get(guildId).clearQueue();
    }

    async remove(guildId) {
        const music = this.guilds.get(guildId);

        if (!music) {
            return;
        }

        await music.disconnect();
        this.guilds.delete(guildId);
    }
}

const musicManager = new MusicManager();

musicManager.YTDLP_COMMON_ARGS = YTDLP_COMMON_ARGS;

module.exports = musicManager;
