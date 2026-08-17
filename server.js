const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");

const {
    S3Client,
    PutObjectCommand
} = require("@aws-sdk/client-s3");


// =======================
// LOAD ENV
// =======================

dotenv.config();


// =======================
// CREATE APP
// =======================

const app = express();


// =======================
// PORT
// =======================

const PORT = process.env.PORT || 5000;


// =======================
// MIDDLEWARE
// =======================

app.use(express.json());

app.use(
    express.urlencoded({
        extended: true
    })
);


// =======================
// PUBLIC FOLDER
// =======================

const publicFolder = path.join(
    __dirname,
    "public"
);

app.use(
    express.static(publicFolder)
);


// =======================
// ENVIRONMENT CHECK
// =======================

console.log(
    "MongoDB URI Loaded:",
    !!process.env.MONGODB_URI
);

console.log(
    "Filebase Access Key Loaded:",
    !!process.env.FILEBASE_ACCESS_KEY
);

console.log(
    "Filebase Secret Key Loaded:",
    !!process.env.FILEBASE_SECRET_KEY
);

console.log(
    "Filebase Bucket Loaded:",
    !!process.env.FILEBASE_BUCKET
);


// =======================
// MONGODB CONNECTION
// =======================

if (!process.env.MONGODB_URI) {

    console.error(
        "MONGODB_URI is missing in .env"
    );

} else {

    mongoose
        .connect(process.env.MONGODB_URI)
        .then(() => {

            console.log(
                "MongoDB Connected Successfully"
            );

        })
        .catch((error) => {

            console.log(
                "MongoDB Error:",
                error.message
            );

        });

}


// =======================
// FILEBASE S3 STORAGE
// =======================

const filebase = new S3Client({

    region: "auto",

    endpoint:
        "https://s3.filebase.io",

    credentials: {

        accessKeyId:
            process.env.FILEBASE_ACCESS_KEY,

        secretAccessKey:
            process.env.FILEBASE_SECRET_KEY

    }

});


// =======================
// UPLOAD FOLDER
// =======================

const uploadFolder = path.join(
    __dirname,
    "uploads"
);


if (!fs.existsSync(uploadFolder)) {

    fs.mkdirSync(
        uploadFolder,
        {
            recursive: true
        }
    );

}


// =======================
// MULTER STORAGE
// =======================

const storage = multer.diskStorage({

    destination: function (
        req,
        file,
        cb
    ) {

        cb(
            null,
            uploadFolder
        );

    },

    filename: function (
        req,
        file,
        cb
    ) {

        const safeName =
            file.originalname
                .replace(/[^a-zA-Z0-9._-]/g, "_");

        const fileName =
            Date.now() +
            "-" +
            safeName;

        cb(
            null,
            fileName
        );

    }

});


// =======================
// MULTER UPLOAD
// =======================

const upload = multer({

    storage: storage,

    limits: {

        fileSize:
            50 * 1024 * 1024

    },

    fileFilter: function (
        req,
        file,
        cb
    ) {

        const fileName =
            file.originalname.toLowerCase();

        if (
            fileName.endsWith(".zip")
        ) {

            cb(
                null,
                true
            );

        } else {

            cb(
                new Error(
                    "Only ZIP files are allowed."
                )
            );

        }

    }

});


// =======================
// SUBMISSION SCHEMA
// =======================

const submissionSchema =
    new mongoose.Schema({

        studentName: {

            type: String,

            required: true,

            trim: true

        },

        email: {

            type: String,

            required: true,

            trim: true

        },

        projectName: {

            type: String,

            required: true,

            trim: true

        },

        aiPrompt: {

            type: String,

            required: true,

            trim: true

        },

        fileUrl: {

            type: String,

            required: true

        },

        fileName: {

            type: String,

            required: true

        },

        submittedAt: {

            type: Date,

            default: Date.now

        }

    });


const Submission =
    mongoose.model(
        "Submission",
        submissionSchema
    );


// =======================
// SUBMIT PROJECT
// =======================

app.post(
    "/submit-project",

    upload.single("projectZip"),

    async (req, res) => {

        let uploadedFile = null;

        try {

            // =======================
            // CHECK ZIP
            // =======================

            if (!req.file) {

                return res
                    .status(400)
                    .send(
                        "Please upload your ZIP file."
                    );

            }


            uploadedFile =
                req.file.path;


            // =======================
            // FORM DATA
            // =======================

            const {
                studentName,
                email,
                projectName,
                aiPrompt
            } = req.body;


            // =======================
            // REQUIRED FIELDS
            // =======================

            if (
                !studentName ||
                !email ||
                !projectName ||
                !aiPrompt
            ) {

                return res
                    .status(400)
                    .send(
                        "Please fill all fields."
                    );

            }


            console.log(
                "Uploading ZIP to Filebase..."
            );


            // =======================
            // FILEBASE FILE NAME
            // =======================

            const filebaseFileName =
                `competition-projects/${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;


            // =======================
            // READ ZIP
            // =======================

            const fileBuffer =
                fs.readFileSync(
                    req.file.path
                );


            // =======================
            // UPLOAD TO FILEBASE
            // =======================

            await filebase.send(

                new PutObjectCommand({

                    Bucket:
                        process.env.FILEBASE_BUCKET,

                    Key:
                        filebaseFileName,

                    Body:
                        fileBuffer,

                    ContentType:
                        "application/zip"

                })

            );


            console.log(
                "ZIP uploaded to Filebase successfully."
            );


            // =======================
            // FILE URL
            // =======================

            const fileUrl =
                `https://${process.env.FILEBASE_BUCKET}.s3.filebase.io/${filebaseFileName}`;


            // =======================
            // SAVE TO MONGODB
            // =======================

            const submission =
                new Submission({

                    studentName:
                        studentName,

                    email:
                        email,

                    projectName:
                        projectName,

                    aiPrompt:
                        aiPrompt,

                    fileUrl:
                        fileUrl,

                    fileName:
                        req.file.originalname

                });


            await submission.save();


            console.log(
                "Submission saved in MongoDB."
            );


            // =======================
            // DELETE LOCAL ZIP
            // =======================

            if (
                fs.existsSync(
                    req.file.path
                )
            ) {

                fs.unlinkSync(
                    req.file.path
                );

            }


            uploadedFile = null;


            // =======================
            // SUCCESS RESPONSE
            // =======================

            res.send(`

<!DOCTYPE html>

<html lang="en">

<head>

    <meta charset="UTF-8">

    <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0"
    >

    <title>
        Submission Successful
    </title>

    <style>

        * {
            box-sizing: border-box;
        }

        body {

            margin: 0;

            min-height: 100vh;

            display: flex;

            justify-content: center;

            align-items: center;

            font-family: Arial, sans-serif;

            background:
                linear-gradient(
                    135deg,
                    #0f172a,
                    #1e293b
                );

            padding: 20px;

        }

        .box {

            width: 100%;

            max-width: 500px;

            background: white;

            padding: 40px;

            border-radius: 18px;

            text-align: center;

            box-shadow:
                0 20px 50px
                rgba(0, 0, 0, 0.3);

        }

        h1 {

            color: #16a34a;

            margin-bottom: 20px;

        }

        p {

            color: #444;

            line-height: 1.6;

        }

        .project {

            font-weight: bold;

            color: #111;

        }

        a {

            display: inline-block;

            margin-top: 20px;

            padding: 12px 22px;

            background: #2563eb;

            color: white;

            text-decoration: none;

            border-radius: 8px;

        }

        a:hover {

            background: #1d4ed8;

        }

    </style>

</head>

<body>

    <div class="box">

        <h1>
            Project Submitted Successfully ✅
        </h1>

        <p>

            Student:

            <strong>
                ${studentName}
            </strong>

        </p>

        <p>

            Project:

            <span class="project">
                ${projectName}
            </span>

        </p>

        <p>
            Your ZIP file has been
            uploaded successfully.
        </p>

        <a href="/">
            Go Back
        </a>

    </div>

</body>

</html>

            `);

        }

        catch (error) {

            console.log(
                "Submission Error:",
                error.message
            );


            // =======================
            // DELETE FAILED UPLOAD
            // =======================

            if (
                uploadedFile &&
                fs.existsSync(
                    uploadedFile
                )
            ) {

                try {

                    fs.unlinkSync(
                        uploadedFile
                    );

                } catch (deleteError) {

                    console.log(
                        "File Delete Error:",
                        deleteError.message
                    );

                }

            }


            res
                .status(500)
                .send(
                    "Upload failed: " +
                    error.message
                );

        }

    }

);


// =======================
// HOME PAGE
// =======================

app.get(
    "/",

    (req, res) => {

        res.sendFile(
            path.join(
                publicFolder,
                "index.html"
            )
        );

    }

);


// =======================
// 404 ROUTE
// =======================

app.use(
    (req, res) => {

        res
            .status(404)
            .send(
                "Page not found."
            );

    }
);


// =======================
// ERROR HANDLER
// =======================

app.use(
    (error, req, res, next) => {

        console.log(
            "Server Error:",
            error.message
        );


        if (
            error.message ===
            "Only ZIP files are allowed."
        ) {

            return res
                .status(400)
                .send(
                    "Only ZIP files are allowed."
                );

        }


        if (
            error.code ===
            "LIMIT_FILE_SIZE"
        ) {

            return res
                .status(400)
                .send(
                    "File size must be less than 50 MB."
                );

        }


        res
            .status(500)
            .send(
                "Something went wrong: " +
                error.message
            );

    }
);


// =======================
// START SERVER
// =======================

app.listen(

    PORT,

    () => {

        console.log(
            `Server running at http://localhost:${PORT}`
        );

        console.log(
            `Public folder: ${publicFolder}`
        );

    }

);