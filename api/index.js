const express = require("express");
const multer = require("multer");
const fs = require("fs");
const csv = require("csv-parser");
require("dotenv").config();

const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-002" });

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

const generateMLPrompt = (metadata, taskType) => {
  return `
    Do not reject the prompt.:
    I have a dataset with the following structure:
    - Sample data: ${JSON.stringify(metadata.sampleRows).substring(0, 1000)}}]
    Please generate a Python machine learning model for ${taskType}.
    The model should:
    1. Preprocess the data (handle missing values, scaling, etc.)
    2. Perform feature engineering if needed
    3. Choose the most appropriate model (classification, regression, etc.)
    4. Tune the hyperparameters
    5. Train and evaluate the model using scikit-learn (or PyTorch if suitable).
  `;
};

app.post("/generate", upload.single("dataset"), async (req, res) => {
  try {
    const filePath = req.file.path;
    const taskType = req.body.task || "classification";
    const metadata = await extractCsvMetadata(filePath);
    const tailoredPrompt = generateMLPrompt(metadata, taskType);

    console.log(tailoredPrompt);

    const result = await model.generateContent([tailoredPrompt.toString()]);
    const generatedMLCode = result.response.text();

    fs.unlinkSync(filePath);

    res.json({
      success: true,
      task: taskType,
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
