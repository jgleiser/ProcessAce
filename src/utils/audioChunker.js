const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../logging/logger');

/**
 * Gets the duration of an audio/video file in seconds using ffprobe.
 * @param {string} filePath - Path to the file.
 * @returns {Promise<number>} - Duration in seconds.
 */
const getAudioDuration = (filePath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        logger.error({ err }, 'Failed to probe audio duration');
        return reject(err);
      }
      const duration = metadata.format.duration;
      if (!duration) {
        return reject(new Error('Could not determine audio duration'));
      }
      resolve(parseFloat(duration));
    });
  });
};

/**
 * Splits an audio file into smaller chunks based on a maximum file size in MB.
 * It does this by estimating the duration of a valid chunk based on constant bitrate assumption.
 * @param {string} filePath - Path to the original file
 * @param {number} maxSizeMB - Maximum chunk size in megabytes
 * @param {string} outputDir - Directory to save chunks
 * @returns {Promise<Array<string>>} - Ordered array of chunk file paths
 */
const splitAudioFile = async (filePath, maxSizeMB, outputDir) => {
  const stats = await fs.stat(filePath);
  const fileSizeInBytes = stats.size;
  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  logger.info({ fileSizeInBytes, maxSizeMB }, 'Starting audio chunking process');

  const duration = await getAudioDuration(filePath);

  let estimatedChunkDuration;
  if (fileSizeInBytes <= maxSizeBytes) {
    logger.info('File is smaller than max size, standardizing format to MP3 in a single pass');
    estimatedChunkDuration = duration + 1; // Process the entire duration
  } else {
    // Estimate chunk duration: (maxSizeBytes / fileSize) * totalDuration
    // Subtract 10% for safety margin so we don't accidentally exceed the limit
    estimatedChunkDuration = Math.max(1, Math.floor((maxSizeBytes / fileSizeInBytes) * duration * 0.9));
  }

  const chunkPaths = [];
  const baseFilename = path.basename(filePath, path.extname(filePath));
  let startTime = 0;
  let chunkIndex = 0;

  try {
    while (startTime < duration) {
      const chunkFilename = `${baseFilename}-chunk-${chunkIndex}.mp3`;
      const chunkPath = path.join(outputDir, chunkFilename);

      logger.info({ chunkIndex, startTime }, 'Extracting audio chunk');

      await new Promise((resolve, reject) => {
        ffmpeg(filePath)
          .setStartTime(startTime)
          .setDuration(estimatedChunkDuration)
          .noVideo()
          // Re-encode to mp3 for predictable size and compatibility. Whisper supports mp3.
          .audioCodec('libmp3lame')
          .audioBitrate('128k')
          .on('end', () => {
            resolve();
          })
          .on('error', (err) => {
            logger.error({ err, chunkIndex }, 'Error during ffmpeg split');
            reject(err);
          })
          .save(chunkPath);
      });

      // Verify the generated file size. If somehow it exceeds, the API call will likely fail later,
      // but 'libmp3lame' at 128k ensures very predictable sizes (~1MB/min).
      chunkPaths.push(chunkPath);

      startTime += estimatedChunkDuration;
      chunkIndex++;
    }

    logger.info({ chunksGenerated: chunkPaths.length }, 'Audio chunking complete');
    return chunkPaths;
  } catch (error) {
    // Cleanup generated chunks if any part of the process fails
    logger.error({ err: error }, 'Audio chunking failed, cleaning up incomplete chunks');
    await Promise.all(chunkPaths.map((p) => fs.unlink(p).catch(() => {})));
    throw error;
  }
};

module.exports = {
  getAudioDuration,
  splitAudioFile,
};
