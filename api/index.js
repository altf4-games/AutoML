const express = require("express");
const multer = require("multer");
const fs = require("fs");
const csv = require("csv-parser");
require("dotenv").config();

const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const app = express();
const upload = multer({ dest: "uploads/" });

const extractCsvMetadata = (filePath) => {
  return new Promise((resolve, reject) => {
    const metadata = {
      columns: [],
      rowCount: 0,
      sampleRows: [],
    };

    fs.createReadStream(filePath)
      .pipe(csv())
      .on("headers", (headers) => {
        metadata.columns = headers;
      })
      .on("data", (row) => {
        if (metadata.rowCount < 5) {
          metadata.sampleRows.push(row);
        }
        metadata.rowCount++;
      })
      .on("end", () => {
        resolve(metadata);
      })
      .on("error", (error) => {
        reject(error);
      });
  });
};

const generateMLPrompt = (metadata, taskType, targetVariable) => {
  return `
    ${JSON.stringify(metadata.sampleRows).substring(0, 1000)}
    Generate a model for ${taskType} using "${targetVariable}" 
  `;
};

app.post("/generate", upload.single("dataset"), async (req, res) => {
  try {
    const filePath = req.file.path;
    const taskType = req.body.task || "classification";
    const targetVariable = req.body.target || "target"; // Default if not provided
    const metadata = await extractCsvMetadata(filePath);
    const tailoredPrompt = generateMLPrompt(metadata, taskType, targetVariable);

    console.log(tailoredPrompt);

    const result = await model.generateContent([tailoredPrompt.toString()]);
    const generatedMLCode = result.response.text();

    fs.unlinkSync(filePath);

    res.json({
      success: true,
      task: taskType,
      target: targetVariable,
      modelCode: generatedMLCode,
    });
  } catch (error) {
    console.error("Error generating model:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to generate model." });
  }
});

app.use(express.static("public"));

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
