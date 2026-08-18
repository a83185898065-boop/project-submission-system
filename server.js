const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

const {
    S3Client,
    PutObjectCommand,
    GetObjectCommand
} = require("@aws-sdk/client-s3");

const {
    getSignedUrl
} = require("@aws-sdk/s3-request-presigner");


// =======================
// LOAD ENV
// =======================

dotenv.config();


// =======================
// APP
// =======================

const app = express();

const PORT =
    process.env.PORT || 5000;


// =======================
// MIDDLEWARE
// =======================

app.use(
    express.json()
);

app.use(
    express.urlencoded({
        extended: true
    })
);


// =======================
// PUBLIC FOLDER
// =======================

const publicFolder =
    path.join(
        __dirname,
        "public"
    );

app.use(
    express.static(
        publicFolder
    )
);


// =======================
// MONGODB
// =======================

mongoose
    .connect(
        process.env.MONGODB_URI
    )
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


// =======================
// FILEBASE
// =======================

const filebase =
    new S3Client({

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


        course: {

            type: String,

            required: true,

            trim: true

        },


        branch: {

            type: String,

            required: true,

            trim: true

        },


        year: {

            type: String,

            required: true,

            trim: true

        },


        rollNo: {

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


// =======================
// MODEL
// =======================

const Submission =
    mongoose.model(
        "Submission",
        submissionSchema
    );


// =======================
// SAFE FILE NAME
// =======================

function safeName(value) {

    return String(
        value || ""
    )

        .trim()

        .replace(
            /[^a-zA-Z0-9._-]/g,
            "_"
        )

        .replace(
            /_+/g,
            "_"
        );

}


// =======================
// CREATE DOWNLOAD NAME
// =======================

function createDownloadName(
    submission
) {

    const studentName =
        safeName(
            submission.studentName ||
            "Student"
        );


    const course =
        safeName(
            submission.course ||
            "Course"
        );


    const branch =
        safeName(
            submission.branch ||
            "Branch"
        );


    const year =
        safeName(
            submission.year ||
            "Year"
        );


    const rollNo =
        safeName(
            submission.rollNo ||
            "RollNo"
        );


    const projectName =
        safeName(
            submission.projectName ||
            "Project"
        );


    return (

        `${studentName}_` +

        `${course}_` +

        `${branch}_` +

        `${year}_` +

        `${rollNo}_` +

        `${projectName}.zip`

    );

}


// ==================================================
// CREATE FILEBASE PRESIGNED UPLOAD URL
// ==================================================

app.post(

    "/api/create-upload-url",

    async (req, res) => {

        try {

            const {

                studentName,

                course,

                branch,

                year,

                rollNo,

                fileName,

                fileSize

            } = req.body;


            // =======================
            // VALIDATION
            // =======================

            if (

                !studentName ||

                !course ||

                !branch ||

                !year ||

                !rollNo ||

                !fileName ||

                !fileSize

            ) {

                return res
                    .status(400)
                    .json({

                        success: false,

                        message:
                            "Required upload information missing."

                    });

            }


            // =======================
            // ZIP CHECK
            // =======================

            if (

                !fileName
                    .toLowerCase()
                    .endsWith(".zip")

            ) {

                return res
                    .status(400)
                    .json({

                        success: false,

                        message:
                            "Only ZIP files are allowed."

                    });

            }


            // =======================
            // 50 MB LIMIT
            // =======================

            const MAX_SIZE =
                50 * 1024 * 1024;


            if (

                Number(fileSize) >
                MAX_SIZE

            ) {

                return res
                    .status(400)
                    .json({

                        success: false,

                        message:
                            "File size must be less than 50 MB."

                    });

            }


            // =======================
            // SAFE VALUES
            // =======================

            const safeStudentName =
                safeName(
                    studentName
                );


            const safeCourse =
                safeName(
                    course
                );


            const safeBranch =
                safeName(
                    branch
                );


            const safeYear =
                safeName(
                    year
                );


            const safeRollNo =
                safeName(
                    rollNo
                );


            const safeOriginalName =
                safeName(
                    fileName
                );


            // =======================
            // FILEBASE KEY
            // =======================

            const key =

                `competition-projects/` +

                `${safeStudentName}_` +

                `${safeCourse}_` +

                `${safeBranch}_` +

                `${safeYear}_` +

                `${safeRollNo}_` +

                `${Date.now()}-` +

                `${safeOriginalName}`;


            console.log(
                "Filebase Key:",
                key
            );


            // =======================
            // PRESIGNED URL
            // =======================

            console.time(
                "CREATE_SIGNED_URL"
            );


            const command =
                new PutObjectCommand({

                    Bucket:
                        process.env.FILEBASE_BUCKET,

                    Key:
                        key,

                    ContentType:
                        "application/zip"

                });


            const uploadUrl =
                await getSignedUrl(

                    filebase,

                    command,

                    {

                        expiresIn: 600

                    }

                );


            console.timeEnd(
                "CREATE_SIGNED_URL"
            );


            // =======================
            // PUBLIC FILE URL
            // =======================

            const fileUrl =

                `https://${process.env.FILEBASE_BUCKET}.s3.filebase.io/${key}`;


            // =======================
            // RESPONSE
            // =======================

            res.json({

                success: true,

                uploadUrl:
                    uploadUrl,

                key:
                    key,

                fileUrl:
                    fileUrl

            });

        }

        catch (error) {

            console.log(
                "Presigned URL Error:",
                error.message
            );


            res
                .status(500)
                .json({

                    success: false,

                    message:
                        error.message

                });

        }

    }

);


// ==================================================
// SAVE SUBMISSION
// ==================================================

app.post(

    "/submit-project",

    async (req, res) => {

        try {

            console.time(
                "TOTAL_SUBMISSION"
            );


            const {

                studentName,

                email,

                course,

                branch,

                year,

                rollNo,

                projectName,

                aiPrompt,

                fileName,

                fileUrl

            } = req.body;


            // =======================
            // REQUIRED DATA
            // =======================

            if (

                !studentName ||

                !email ||

                !course ||

                !branch ||

                !year ||

                !rollNo ||

                !projectName ||

                !aiPrompt ||

                !fileName ||

                !fileUrl

            ) {

                return res
                    .status(400)
                    .json({

                        success: false,

                        message:
                            "Please fill all fields."

                    });

            }


            // =======================
            // ZIP CHECK
            // =======================

            if (

                !fileName
                    .toLowerCase()
                    .endsWith(".zip")

            ) {

                return res
                    .status(400)
                    .json({

                        success: false,

                        message:
                            "Only ZIP files are allowed."

                    });

            }


            // =======================
            // CONSOLE DETAILS
            // =======================

            console.log(
                "=============================="
            );


            console.log(
                "Student Submission Received"
            );


            console.log(
                "Student Name:",
                studentName
            );


            console.log(
                "Email:",
                email
            );


            console.log(
                "Course:",
                course
            );


            console.log(
                "Branch:",
                branch
            );


            console.log(
                "Year:",
                year
            );


            console.log(
                "Roll No:",
                rollNo
            );


            console.log(
                "Project Name:",
                projectName
            );


            console.log(
                "File Name:",
                fileName
            );


            console.log(
                "File URL:",
                fileUrl
            );


            console.log(
                "=============================="
            );


            // =======================
            // MONGODB
            // =======================

            console.time(
                "MONGODB_SAVE"
            );


            const submission =
                new Submission({

                    studentName:
                        studentName,

                    email:
                        email,

                    course:
                        course,

                    branch:
                        branch,

                    year:
                        year,

                    rollNo:
                        rollNo,

                    projectName:
                        projectName,

                    aiPrompt:
                        aiPrompt,

                    fileUrl:
                        fileUrl,

                    fileName:
                        fileName

                });


            await submission.save();


            console.timeEnd(
                "MONGODB_SAVE"
            );


            console.timeEnd(
                "TOTAL_SUBMISSION"
            );


            console.log(
                "Submission saved successfully."
            );


            // =======================
            // SUCCESS
            // =======================

            res.json({

                success: true,

                message:
                    "Project submitted successfully.",

                studentName:
                    studentName,

                projectName:
                    projectName,

                branch:
                    branch,

                year:
                    year,

                rollNo:
                    rollNo

            });

        }

        catch (error) {

            console.log(
                "Submission Error:",
                error.message
            );


            res
                .status(500)
                .json({

                    success: false,

                    message:
                        "Submission failed: " +
                        error.message

                });

        }

    }

);


// ==================================================
// DOWNLOAD PROJECT
// ==================================================

app.get(

    "/api/download/:id",

    async (req, res) => {

        try {

            // =======================
            // FIND SUBMISSION
            // =======================

            const submission =
                await Submission.findById(
                    req.params.id
                );


            if (!submission) {

                return res
                    .status(404)
                    .send(
                        "Submission not found."
                    );

            }


            // =======================
            // FILE URL
            // =======================

            if (
                !submission.fileUrl
            ) {

                return res
                    .status(400)
                    .send(
                        "File URL not found."
                    );

            }


            // =======================
            // GET FILEBASE KEY
            // =======================

            let key;


            try {

                const fileUrl =
                    new URL(
                        submission.fileUrl
                    );


                key =
                    decodeURIComponent(
                        fileUrl.pathname
                    );


                key =
                    key.replace(
                        /^\/+/,
                        ""
                    );

            }

            catch (error) {

                console.log(
                    "URL Error:",
                    error.message
                );


                return res
                    .status(400)
                    .send(
                        "Invalid Filebase URL."
                    );

            }


            if (!key) {

                return res
                    .status(400)
                    .send(
                        "File key not found."
                    );

            }


            console.log(
                "Download Key:",
                key
            );


            // =======================
            // GET FILEBASE OBJECT
            // =======================

            const command =
                new GetObjectCommand({

                    Bucket:
                        process.env.FILEBASE_BUCKET,

                    Key:
                        key

                });


            const response =
                await filebase.send(
                    command
                );


            // =======================
            // CREATE DOWNLOAD NAME
            // =======================

            const downloadName =
                createDownloadName(
                    submission
                );


            console.log(
                "Download Name:",
                downloadName
            );


            // =======================
            // HEADERS
            // =======================

            res.setHeader(
                "Content-Type",
                "application/zip"
            );


            res.setHeader(
                "Content-Disposition",
                `attachment; filename="${downloadName}"`
            );


            if (
                response.ContentLength
            ) {

                res.setHeader(
                    "Content-Length",
                    response.ContentLength
                );

            }


            // =======================
            // SEND FILE
            // =======================

            if (

                response.Body &&

                typeof response.Body.pipe ===
                "function"

            ) {

                response.Body.pipe(
                    res
                );

            }

            else {

                const chunks = [];


                for await (

                    const chunk
                    of response.Body

                ) {

                    chunks.push(
                        chunk
                    );

                }


                const buffer =
                    Buffer.concat(
                        chunks
                    );


                res.end(
                    buffer
                );

            }

        }

        catch (error) {

            console.log(
                "Download Error:",
                error.message
            );


            if (
                !res.headersSent
            ) {

                res
                    .status(500)
                    .send(
                        "Download failed: " +
                        error.message
                    );

            }

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
// HEALTH CHECK
// =======================

app.get(

    "/api/health",

    (req, res) => {

        res.json({

            success: true,

            server:
                "online",

            message:
                "Backend is running."

        });

    }

);


// =======================
// 404
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

    (
        error,
        req,
        res,
        next
    ) => {

        console.log(
            "Server Error:",
            error.message
        );


        res
            .status(500)
            .json({

                success: false,

                message:
                    error.message

            });

    }

);


// =======================
// START SERVER
// =======================

app.listen(

    PORT,

    () => {

        console.log(
            "===================================="
        );


        console.log(
            `Server running at http://localhost:${PORT}`
        );


        console.log(
            `Public folder: ${publicFolder}`
        );


        console.log(
            "Upload API: /api/create-upload-url"
        );


        console.log(
            "Submit API: /submit-project"
        );


        console.log(
            "Download API: /api/download/:id"
        );


        console.log(
            "Health API: /api/health"
        );


        console.log(
            "===================================="
        );

    }

);