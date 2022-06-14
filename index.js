const actions = require('@actions/core');
const { google } = require('googleapis');
const fs = require('fs');
const archiver = require('archiver');

/** Google Service Account credentials  encoded in base64 */
const credentials = actions.getInput('credentials', { required: true });
/** Google Drive Folder ID to upload the file/folder to */
const folder = actions.getInput('folder', { required: true });
/** Local path to the file/folder to upload */
const target = actions.getInput('target', { required: true });
/** Optional name for the zipped file */
const name = actions.getInput('name', { required: false });
/** Link to the Drive folder */
const link = 'link';

const credentialsJSON = JSON.parse(Buffer.from(credentials, 'base64').toString());
const scopes = ['https://www.googleapis.com/auth/drive'];
const auth = new google.auth.JWT(credentialsJSON.client_email, null, credentialsJSON.private_key, scopes);
const drive = google.drive({ version: 'v3', auth });

const driveLink = `https://drive.google.com/drive/folders/${folder}`
let filename = target.split('/').pop();

async function main() {
  actions.setOutput(link, driveLink);

  if (fs.lstatSync(target).isDirectory()) {
    filename = `${name || target}.zip`

    actions.info(`Folder detected in ${target}`)
    actions.info(`Zipping ${target}...`)

    zipDirectory(target, filename)
      .then(() => uploadToDrive())
      .catch(e => {
        actions.error('Zip failed');
        throw e;
      });
  }
  else
    uploadToDrive().catch(e => { throw e; });
}

/**
 * Zips a directory and stores it in memory
 * @param {string} source File or folder to be zipped
 * @param {string} out Name of the resulting zipped file
 */
function zipDirectory(source, out) {
  const archive = archiver('zip', { zlib: { level: 9 } });
  const stream = fs.createWriteStream(out);

  return new Promise((resolve, reject) => {
    archive
      .directory(source, false)
      .on('error', err => reject(err))
      .pipe(stream);

    stream.on('close',
      () => {
        actions.info(`Folder successfully zipped: ${archive.pointer()} total bytes written`);
        return resolve();
      });
    archive.finalize();
  });
}

/**
 * Uploads the file to Google Drive
 */
function uploadToDrive() {
  actions.info('Uploading file to Google Drive...');
  let fileId = '';

  drive.files.create({
    requestBody: {
      name: filename,
      parents: [folder],
    },
    media: {
      body: fs.createReadStream(`${name || target}${fs.lstatSync(target).isDirectory() ? '.zip' : ''}`)
    },
  }).then((res) => { actions.info(`File uploaded successfully ${res.data.id}`); fileId = res.data.id; })
    .catch(error => {
      actions.error('Upload failed');
      throw error;
  });
  
}

main().catch(e => actions.setFailed(e));
