export type LineConfig = {
    readonly channelAccessToken: string
};

export type Config = {
    readonly url: string,
    readonly awsBucketName: string,
    readonly line: LineConfig;
};

export type Data = {
    readonly prevContentHash: string;
}