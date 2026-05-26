import { expect } from 'chai';
import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { ImageContentPolicy } from '../../src/uploads/image-content.policy';
import {
  createJpegBuffer,
  createOversizedPngBuffer,
  createPngBuffer,
  tinyGifBuffer,
} from '../support/fixtures';

async function writeTempFile(
  filename: string,
  contents: Buffer,
): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'upload-policy-'));
  const absolutePath = path.join(directory, filename);
  await fs.writeFile(absolutePath, contents);
  return absolutePath;
}

describe('ImageContentPolicy', () => {
  describe('isSupportedDeclaredExtension', () => {
    it('accepts .jpg', () => {
      expect(ImageContentPolicy.isSupportedDeclaredExtension('photo.jpg')).to.equal(
        true,
      );
    });

    it('accepts .jpeg', () => {
      expect(
        ImageContentPolicy.isSupportedDeclaredExtension('photo.jpeg'),
      ).to.equal(true);
    });

    it('accepts .png', () => {
      expect(ImageContentPolicy.isSupportedDeclaredExtension('photo.png')).to.equal(
        true,
      );
    });

    it('accepts .webp', () => {
      expect(
        ImageContentPolicy.isSupportedDeclaredExtension('photo.webp'),
      ).to.equal(true);
    });

    it('is case-insensitive (.JPG)', () => {
      expect(ImageContentPolicy.isSupportedDeclaredExtension('photo.JPG')).to.equal(
        true,
      );
    });

    it('rejects .gif', () => {
      expect(ImageContentPolicy.isSupportedDeclaredExtension('photo.gif')).to.equal(
        false,
      );
    });

    it('rejects .svg', () => {
      expect(ImageContentPolicy.isSupportedDeclaredExtension('photo.svg')).to.equal(
        false,
      );
    });

    it('rejects files with no extension', () => {
      expect(ImageContentPolicy.isSupportedDeclaredExtension('photo')).to.equal(
        false,
      );
    });

    it('rejects .exe', () => {
      expect(
        ImageContentPolicy.isSupportedDeclaredExtension('malware.exe'),
      ).to.equal(false);
    });
  });

  describe('assertSize', () => {
    const limit = ImageContentPolicy.maxFileSizeInBytes;

    it('accepts a file exactly at the size limit', () => {
      expect(() => ImageContentPolicy.assertSize(limit)).not.to.throw();
    });

    it('accepts a file well below the limit', () => {
      expect(() => ImageContentPolicy.assertSize(1024)).not.to.throw();
    });

    it('rejects a file one byte over the limit', () => {
      expect(() => ImageContentPolicy.assertSize(limit + 1))
        .to.throw(PayloadTooLargeException)
        .with.property('message', 'The uploaded file exceeds the size limit.');
    });

    it('rejects a file significantly over the limit', () => {
      expect(() => ImageContentPolicy.assertSize(limit * 2))
        .to.throw(PayloadTooLargeException)
        .with.property('message', 'The uploaded file exceeds the size limit.');
    });

    it('accepts zero bytes', () => {
      expect(() => ImageContentPolicy.assertSize(0)).not.to.throw();
    });
  });

  describe('inspectFile', () => {
    it('accepts a valid PNG file with matching declared metadata', async () => {
      const absolutePath = await writeTempFile(
        'image.png',
        await createPngBuffer(),
      );

      const result = await ImageContentPolicy.inspectFile(
        absolutePath,
        'image/png',
        'image.png',
      );
      expect(result.detectedFormat).to.equal('png');
      expect(result.normalizedMimeType).to.equal('image/png');
    });

    it('rejects MIME/content mismatches with an unsupported media exception', async () => {
      const absolutePath = await writeTempFile(
        'image.jpg',
        await createJpegBuffer(),
      );

      try {
        await ImageContentPolicy.inspectFile(
          absolutePath,
          'image/png',
          'image.jpg',
        );
        expect.fail('Expected MIME/content mismatch to throw.');
      } catch (error) {
        expect(error).to.be.instanceOf(UnsupportedMediaTypeException);
        expect((error as Error).message).to.equal(
          'The uploaded file MIME type does not match the decoded image format.',
        );
      }
    });

    it('rejects corrupt image bytes with a bad request exception', async () => {
      const absolutePath = await writeTempFile(
        'image.png',
        Buffer.from('corrupt'),
      );

      try {
        await ImageContentPolicy.inspectFile(
          absolutePath,
          'image/png',
          'image.png',
        );
        expect.fail('Expected corrupt content to throw.');
      } catch (error) {
        expect(error).to.be.instanceOf(BadRequestException);
        expect((error as Error).message).to.equal(
          'The uploaded file content is not a valid image.',
        );
      }
    });

    it('rejects oversized image dimensions with a payload-too-large exception', async () => {
      const absolutePath = await writeTempFile(
        'large.png',
        await createOversizedPngBuffer(),
      );

      try {
        await ImageContentPolicy.inspectFile(
          absolutePath,
          'image/png',
          'large.png',
        );
        expect.fail('Expected oversized dimensions to throw.');
      } catch (error) {
        expect(error).to.be.instanceOf(PayloadTooLargeException);
        expect((error as Error).message).to.equal(
          'The uploaded image dimensions exceed the supported limits.',
        );
      }
    });

    it('rejects unsupported decoded formats with an unsupported media exception', async () => {
      const absolutePath = await writeTempFile('animated.gif', tinyGifBuffer);

      try {
        await ImageContentPolicy.inspectFile(
          absolutePath,
          'image/gif',
          'animated.gif',
        );
        expect.fail('Expected unsupported format to throw.');
      } catch (error) {
        expect(error).to.be.instanceOf(UnsupportedMediaTypeException);
        expect((error as Error).message).to.equal(
          'Only JPEG, PNG, and WebP images are supported.',
        );
      }
    });
  });
});
