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

// ==================================================
// LOAD ENVIRONMENT VARIABLES
// ==================================================

dotenv.config();

// ==================================================
// APP
// ==================================================

const app = express();

const PORT = process.env.PORT || 5000;

// ==================================================
// MIDDLEWARE
// ==================================================

app.use(
    express.json({
        limit: "10mb"
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: "10mb"
    })
);

// ==================================================
// PUBLIC FOLDER
// ==================================================
// Structure:
// backend/
//   public/
//      index.html
//      feedback.html
//   server.js
// ==================================================

const publicFolder = path.join(
    __dirname,
    "public"
);

app.use(
    express.static(publicFolder)
);

// ==================================================
// MONGODB CONNECTION
// ==================================================

mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => {

        console.log(
            "MongoDB Connected Successfully"
        );

    })
    .catch((error) => {

        console.error(
            "MongoDB Error:",
            error.message
        );

    });

// ==================================================
// FILEBASE S3 CLIENT
// ==================================================

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

// ==================================================
// SUBMISSION SCHEMA
// ==================================================

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
            required: true,
            trim: true
        },

        fileName: {
            type: String,
            required: true,
            trim: true
        },

        // ==================================================
        // MASK
        // INTEGER / NUMBER
        // ==================================================

        mask: {
            type: Number,
            default: null,

            validate: {
                validator: function (value) {

                    return (
                        value === null ||
                        Number.isInteger(value)
                    );

                },

                message:
                    "Mask must be an integer."
            }
        },

        // ==================================================
        // LIVE URL
        // STRING
        // ==================================================

        liveUrl: {
            type: String,
            default: "",
            trim: true
        },

        // ==================================================
        // CHECK
        // BOOLEAN
        // ==================================================

        check: {
            type: Boolean,
            default: false
        },

        submittedAt: {
            type: Date,
            default: Date.now
        }

    });

// ==================================================
// SUBMISSION MODEL
// ==================================================

const Submission =
    mongoose.model(
        "Submission",
        submissionSchema
    );

// ==================================================
// FEEDBACK SCHEMA
// ==================================================

const feedbackSchema =
    new mongoose.Schema({

        // ==================================================
        // STUDENT DETAILS
        // ==================================================

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

        // ==================================================
        // FEEDBACK RATINGS
        // ==================================================

        overallExperience: {
            type: Number,
            required: true,
            min: 1,
            max: 5
        },

        organisation: {
            type: Number,
            required: true,
            min: 1,
            max: 5
        },

        activities: {
            type: Number,
            required: true,
            min: 1,
            max: 5
        },

        // ==================================================
        // FEEDBACK TEXT
        // ==================================================

        likedMost: {
            type: String,
            required: true,
            trim: true
        },

        suggestions: {
            type: String,
            required: true,
            trim: true
        },

        submittedAt: {
            type: Date,
            default: Date.now
        }

    });

// ==================================================
// FEEDBACK MODEL
// ==================================================

const Feedback =
    mongoose.model(
        "Feedback",
        feedbackSchema
    );

// ==================================================
// SAFE FILE NAME
// ==================================================

function safeName(value) {

    return String(value || "")
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

// ==================================================
// CREATE DOWNLOAD NAME
// ==================================================

function createDownloadName(submission) {

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

            // ==================================================
            // VALIDATION
            // ==================================================

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

            // ==================================================
            // ZIP CHECK
            // ==================================================

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

            // ==================================================
            // 50 MB LIMIT
            // ==================================================

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

            // ==================================================
            // SAFE VALUES
            // ==================================================

            const safeStudentName =
                safeName(studentName);

            const safeCourse =
                safeName(course);

            const safeBranch =
                safeName(branch);

            const safeYear =
                safeName(year);

            const safeRollNo =
                safeName(rollNo);

            const safeOriginalName =
                safeName(fileName);

            // ==================================================
            // FILEBASE KEY
            // ==================================================

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

            // ==================================================
            // PRESIGNED URL
            // ==================================================

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

            // ==================================================
            // PUBLIC FILE URL
            // ==================================================

            const fileUrl =
                `https://${process.env.FILEBASE_BUCKET}.s3.filebase.io/${key}`;

            // ==================================================
            // RESPONSE
            // ==================================================

            return res.json({

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

            console.error(
                "Presigned URL Error:",
                error
            );

            return res
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
// SAVE PROJECT SUBMISSION
// ==================================================

app.post(
    "/submit-project",
    async (req, res) => {

        try {

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
                fileUrl,

                mask,
                liveUrl,
                check

            } = req.body;

            // ==================================================
            // REQUIRED DATA
            // ==================================================

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
                            "Please fill all required fields."

                    });

            }

            // ==================================================
            // ZIP CHECK
            // ==================================================

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

            // ==================================================
            // MASK CONVERSION
            // ==================================================

            let finalMask = null;

            if (
                mask !== undefined &&
                mask !== null &&
                mask !== ""
            ) {

                const numericMask =
                    Number(mask);

                if (
                    !Number.isInteger(
                        numericMask
                    )
                ) {

                    return res
                        .status(400)
                        .json({

                            success: false,

                            message:
                                "Mask must be an integer."

                        });

                }

                finalMask =
                    numericMask;

            }

            // ==================================================
            // LIVE URL
            // ==================================================

            const finalLiveUrl =
                typeof liveUrl === "string"
                    ? liveUrl.trim()
                    : "";

            // ==================================================
            // CHECK
            // ==================================================

            const finalCheck =
                check === true ||
                check === "true"
                    ? true
                    : false;

            // ==================================================
            // CONSOLE
            // ==================================================

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
                "Mask:",
                finalMask
            );

            console.log(
                "Live URL:",
                finalLiveUrl
            );

            console.log(
                "Check:",
                finalCheck
            );

            console.log(
                "=============================="
            );

            // ==================================================
            // MONGODB SAVE
            // ==================================================

            const submission =
                new Submission({

                    studentName:
                        studentName.trim(),

                    email:
                        email.trim(),

                    course:
                        course.trim(),

                    branch:
                        branch.trim(),

                    year:
                        year.trim(),

                    rollNo:
                        rollNo.trim(),

                    projectName:
                        projectName.trim(),

                    aiPrompt:
                        aiPrompt.trim(),

                    fileUrl:
                        fileUrl.trim(),

                    fileName:
                        fileName.trim(),

                    mask:
                        finalMask,

                    liveUrl:
                        finalLiveUrl,

                    check:
                        finalCheck

                });

            await submission.save();

            console.log(
                "Submission saved successfully."
            );

            // ==================================================
            // SUCCESS
            // ==================================================

            return res
                .status(201)
                .json({

                    success: true,

                    message:
                        "Project submitted successfully.",

                    studentName:
                        submission.studentName,

                    projectName:
                        submission.projectName,

                    branch:
                        submission.branch,

                    year:
                        submission.year,

                    rollNo:
                        submission.rollNo,

                    mask:
                        submission.mask,

                    liveUrl:
                        submission.liveUrl,

                    check:
                        submission.check

                });

        }

        catch (error) {

            console.error(
                "Submission Error:",
                error
            );

            return res
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
// SAVE FEEDBACK
// ==================================================

app.post(
    "/api/feedback",
    async (req, res) => {

        try {

            const {

                studentName,
                email,
                course,
                branch,
                year,
                rollNo,

                overallExperience,
                organisation,
                activities,
                likedMost,
                suggestions

            } = req.body;

            // ==================================================
            // REQUIRED VALIDATION
            // ==================================================

            if (
                !studentName ||
                !email ||
                !course ||
                !branch ||
                !year ||
                !rollNo ||
                overallExperience === undefined ||
                organisation === undefined ||
                activities === undefined ||
                !likedMost ||
                !suggestions
            ) {

                return res
                    .status(400)
                    .json({

                        success: false,

                        message:
                            "Please fill all student and feedback fields."

                    });

            }

            // ==================================================
            // CLEAN TEXT DATA
            // ==================================================

            const cleanStudentName =
                String(studentName).trim();

            const cleanEmail =
                String(email).trim();

            const cleanCourse =
                String(course).trim();

            const cleanBranch =
                String(branch).trim();

            const cleanYear =
                String(year).trim();

            const cleanRollNo =
                String(rollNo).trim();

            const cleanLikedMost =
                String(likedMost).trim();

            const cleanSuggestions =
                String(suggestions).trim();

            // ==================================================
            // CHECK EMPTY VALUES
            // ==================================================

            if (
                !cleanStudentName ||
                !cleanEmail ||
                !cleanCourse ||
                !cleanBranch ||
                !cleanYear ||
                !cleanRollNo ||
                !cleanLikedMost ||
                !cleanSuggestions
            ) {

                return res
                    .status(400)
                    .json({

                        success: false,

                        message:
                            "Student details and feedback cannot be empty."

                    });

            }

            // ==================================================
            // RATING CONVERSION
            // ==================================================

            const experience =
                Number(
                    overallExperience
                );

            const organisationRating =
                Number(
                    organisation
                );

            const activitiesRating =
                Number(
                    activities
                );

            // ==================================================
            // RATING VALIDATION
            // ==================================================

            if (
                !Number.isInteger(
                    experience
                ) ||
                experience < 1 ||
                experience > 5
            ) {

                return res
                    .status(400)
                    .json({

                        success: false,

                        message:
                            "Overall Experience rating must be between 1 and 5."

                    });

            }

            if (
                !Number.isInteger(
                    organisationRating
                ) ||
                organisationRating < 1 ||
                organisationRating > 5
            ) {

                return res
                    .status(400)
                    .json({

                        success: false,

                        message:
                            "Organisation rating must be between 1 and 5."

                    });

            }

            if (
                !Number.isInteger(
                    activitiesRating
                ) ||
                activitiesRating < 1 ||
                activitiesRating > 5
            ) {

                return res
                    .status(400)
                    .json({

                        success: false,

                        message:
                            "Activities rating must be between 1 and 5."

                    });

            }

            // ==================================================
            // CREATE FEEDBACK
            // ==================================================

            const feedback =
                new Feedback({

                    studentName:
                        cleanStudentName,

                    email:
                        cleanEmail,

                    course:
                        cleanCourse,

                    branch:
                        cleanBranch,

                    year:
                        cleanYear,

                    rollNo:
                        cleanRollNo,

                    overallExperience:
                        experience,

                    organisation:
                        organisationRating,

                    activities:
                        activitiesRating,

                    likedMost:
                        cleanLikedMost,

                    suggestions:
                        cleanSuggestions

                });

            // ==================================================
            // SAVE TO MONGODB
            // ==================================================

            await feedback.save();

            console.log(
                "Feedback saved successfully."
            );

            // ==================================================
            // SUCCESS RESPONSE
            // ==================================================

            return res
                .status(201)
                .json({

                    success: true,

                    message:
                        "Feedback submitted successfully.",

                    feedbackId:
                        feedback._id,

                    studentName:
                        feedback.studentName,

                    rollNo:
                        feedback.rollNo

                });

        }

        catch (error) {

            console.error(
                "Feedback Error:",
                error
            );

            return res
                .status(500)
                .json({

                    success: false,

                    message:
                        "Feedback submission failed: " +
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

            // ==================================================
            // FIND SUBMISSION
            // ==================================================

            const submission =
                await Submission.findById(
                    req.params.id
                );

            if (!submission) {

                return res
                    .status(404)
                    .json({

                        success: false,

                        message:
                            "Submission not found."

                    });

            }

            // ==================================================
            // FILE URL
            // ==================================================

            if (
                !submission.fileUrl
            ) {

                return res
                    .status(400)
                    .json({

                        success: false,

                        message:
                            "File URL not found."

                    });

            }

            // ==================================================
            // GET FILEBASE KEY
            // ==================================================

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

                console.error(
                    "URL Error:",
                    error.message
                );

                return res
                    .status(400)
                    .json({

                        success: false,

                        message:
                            "Invalid Filebase URL."

                    });

            }

            if (!key) {

                return res
                    .status(400)
                    .json({

                        success: false,

                        message:
                            "File key not found."

                    });

            }

            console.log(
                "Download Key:",
                key
            );

            // ==================================================
            // GET FILEBASE OBJECT
            // ==================================================

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

            // ==================================================
            // CREATE DOWNLOAD NAME
            // ==================================================

            const downloadName =
                createDownloadName(
                    submission
                );

            console.log(
                "Download Name:",
                downloadName
            );

            // ==================================================
            // RESPONSE HEADERS
            // ==================================================

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

            // ==================================================
            // SEND FILE
            // ==================================================

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
                    const chunk of response.Body
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

            console.error(
                "Download Error:",
                error
            );

            if (
                !res.headersSent
            ) {

                return res
                    .status(500)
                    .json({

                        success: false,

                        message:
                            "Download failed: " +
                            error.message

                    });

            }

        }

    }
);

// ==================================================
// STUDENT SUBMISSION PAGE
// ==================================================
// http://127.0.0.1:5000/
// ==================================================

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

// ==================================================
// STUDENT FEEDBACK PAGE
// ==================================================
// http://127.0.0.1:5000/feedback.html
// ==================================================

app.get(
    "/feedback.html",
    (req, res) => {

        res.sendFile(
            path.join(
                publicFolder,
                "feedback.html"
            )
        );

    }
);

// ==================================================
// HEALTH CHECK
// ==================================================

app.get(
    "/api/health",
    (req, res) => {

        return res.json({

            success: true,

            server:
                "online",

            message:
                "Backend is running."

        });

    }
);

// ==================================================
// 404 HANDLER
// ==================================================

app.use(
    (req, res) => {

        return res
            .status(404)
            .json({

                success: false,

                message:
                    "Page not found."

            });

    }
);

// ==================================================
// ERROR HANDLER
// ==================================================

app.use(
    (
        error,
        req,
        res,
        next
    ) => {

        console.error(
            "Server Error:",
            error
        );

        if (
            res.headersSent
        ) {

            return next(
                error
            );

        }

        return res
            .status(500)
            .json({

                success: false,

                message:
                    error.message ||
                    "Internal server error."

            });

    }
);

// ==================================================
// START SERVER
// ==================================================

app.listen(
    PORT,
    () => {

        console.log(
            "===================================="
        );

        console.log(
            `Student Submission Server running at http://127.0.0.1:${PORT}/`
        );

        console.log(
            `Public folder: ${publicFolder}`
        );

        console.log(
            `Submission Page: http://127.0.0.1:${PORT}/`
        );

        console.log(
            `Feedback Page: http://127.0.0.1:${PORT}/feedback.html`
        );

        console.log(
            "Upload API: /api/create-upload-url"
        );

        console.log(
            "Submit API: /submit-project"
        );

        console.log(
            "Feedback API: /api/feedback"
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