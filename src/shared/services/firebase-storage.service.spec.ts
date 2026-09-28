import { FirebaseStorageService } from './firebase-storage.service';

// Every real consumer of this service went through the same Cloudinary ->
// Firebase migration (avatars, landing content, admin articles, client
// images, chat attachments), so these tests cover the two behaviors that
// migration actually depends on: replace-by-prefix (so a single-slot image
// like an avatar never leaves the old file behind) and correct mime
// detection on a base64 payload that arrives with no "data:...;base64,"
// prefix (the chat attachment path).
function setup() {
  const existingFiles = [{ delete: jest.fn().mockResolvedValue(undefined) }];
  const bucket: any = {
    getFiles: jest.fn().mockResolvedValue([existingFiles]),
    upload: jest.fn().mockResolvedValue([
      { publicUrl: () => 'https://storage.googleapis.com/bucket/uploaded' },
    ]),
    file: jest.fn().mockReturnValue({
      save: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      publicUrl: () => 'https://storage.googleapis.com/bucket/file',
    }),
  };
  const service = new FirebaseStorageService(bucket);
  return { service, bucket, existingFiles };
}

describe('uploadBufferReplacing', () => {
  it('deletes every existing file under the prefix before uploading', async () => {
    const { service, bucket, existingFiles } = setup();
    const file = { originalname: 'avatar.png', mimetype: 'image/png', buffer: Buffer.from('x') } as any;

    const result = await service.uploadBufferReplacing(file, 'avatars/user-1');

    expect(bucket.getFiles).toHaveBeenCalledWith({ prefix: 'avatars/user-1' });
    expect(existingFiles[0].delete).toHaveBeenCalled();
    expect(result.imageUrl).toBe('https://storage.googleapis.com/bucket/file');
  });
});

describe('deleteByPrefix', () => {
  it('deletes every file under the prefix and returns true', async () => {
    const { service, bucket, existingFiles } = setup();

    const result = await service.deleteByPrefix('avatars/user-1');

    expect(bucket.getFiles).toHaveBeenCalledWith({ prefix: 'avatars/user-1' });
    expect(existingFiles[0].delete).toHaveBeenCalled();
    expect(result).toBe(true);
  });
});

describe('uploadFromBase64', () => {
  it('honors an explicit data URI mime type', async () => {
    const { service, bucket } = setup();

    await service.uploadFromBase64('data:image/webp;base64,AAAA', 'KHS/chat');

    const savedMetadata = (bucket.file().save as jest.Mock).mock.calls[0][1];
    expect(savedMetadata.metadata.contentType).toBe('image/webp');
  });

  it('sniffs the mime type from raw base64 with no data URI prefix', async () => {
    const { service, bucket } = setup();

    // "iVBORw0KGgo" is the standard leading base64 for a PNG signature.
    await service.uploadFromBase64('iVBORw0KGgoAAAA', 'KHS/chat');

    const savedMetadata = (bucket.file().save as jest.Mock).mock.calls[0][1];
    expect(savedMetadata.metadata.contentType).toBe('image/png');
  });

  it('rejects an empty payload', async () => {
    const { service } = setup();

    await expect(service.uploadFromBase64('', 'KHS/chat')).rejects.toThrow();
  });
});
