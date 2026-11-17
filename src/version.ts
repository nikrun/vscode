declare const __NIKRUN_VERSION__: string | undefined;

export const Version: string =
  typeof __NIKRUN_VERSION__ !== 'undefined' ? __NIKRUN_VERSION__ : 'v0.1.0-build.0-channel.dev';
