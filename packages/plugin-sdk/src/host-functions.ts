declare module 'extism:host' {
  interface user {
    albumAddAssets(ptr: PTR): I64;
  }
}

const host = Host.getFunctions();
type HostFunctionName = keyof typeof host;

const call = <T, R>(name: HostFunctionName, authToken: string, args: T) => {
  const pointer1 = Memory.fromString(JSON.stringify({ authToken, args }));
  const fn = host[name];
  const handler = Memory.find(fn(pointer1.offset));

  try {
    const result = JSON.parse(handler.readString()) as
      | {
          success: true;
          response: R;
        }
      | { success: false; status: number; message: string };

    if (result.success) {
      return result.response;
    }

    throw new Error(
      `Failed to call host function "${name}", received ${
        result.status
      } - ${JSON.stringify(result.message)}`
    );
  } finally {
    handler.free();
    pointer1.free();
  }
};

export const hostFunctions = (authToken: string) => ({
  albumAddAssets: (albumId: string, assetIds: string[]) =>
    call('albumAddAssets', authToken, [albumId, { ids: assetIds }]),
});
