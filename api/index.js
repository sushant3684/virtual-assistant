import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v2 as cloudinary } from "cloudinary";
import axios from "axios";

// ============ DATABASE ============
let cached = global.mongoose;
if (!cached) cached = global.mongoose = { conn: null, promise: null };

async function connectDb() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(process.env.MONGODB_URL).then((m) => m);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

// ============ USER MODEL ============
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  assistantName: { type: String },
  assistantImage: { type: String },
  history: [{ type: String }]
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model("User", userSchema);

// ============ AUTH HELPERS ============
const createToken = (userId) => jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "7d" });

const verifyToken = (token) => {
  try { return jwt.verify(token, process.env.JWT_SECRET); }
  catch { return null; }
};

const getTokenFromCookies = (cookieHeader) => {
  if (!cookieHeader) return null;
  const cookies = Object.fromEntries(cookieHeader.split(";").map(c => c.trim().split("=")));
  return cookies.token || null;
};

const setCookieHeader = (token) => `token=${token}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${7*24*60*60}`;
const clearCookieHeader = () => `token=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0`;

// ============ CLOUDINARY ============
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadToCloudinary = async (base64) => {
  const result = await cloudinary.uploader.upload(base64, { folder: "voice-assistant" });
  return result.secure_url;
};

// ============ GEMINI ============
const geminiResponse = async (command, assistantName, userName) => {
  try {
    const prompt = `You are a virtual assistant named ${assistantName} created by ${userName}. 
Respond with JSON only: {"type": "general|google-search|youtube-search|youtube-play|get-time|get-date|get-day|get-month|calculator-open|instagram-open|facebook-open|weather-show", "userInput": "<input>", "response": "<short spoken response>"}
User input: ${command}`;
    
    const result = await axios.post(process.env.GEMINI_API_URL, {
      contents: [{ parts: [{ text: prompt }] }]
    });
    return result.data.candidates[0].content.parts[0].text;
  } catch (e) {
    return JSON.stringify({ type: "general", userInput: command, response: "Sorry, error occurred." });
  }
};

// ============ CORS HEADERS ============
const setCors = (res, origin) => {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
};

// ============ MAIN HANDLER ============
export default async function handler(req, res) {
  setCors(res, req.headers.origin);
  if (req.method === "OPTIONS") return res.status(200).end();

  const path = req.url.split("?")[0];

  try {
    // -------- SIGNUP --------
    if (path === "/api/auth/signup" && req.method === "POST") {
      await connectDb();
      const { name, email, password } = req.body;
      if (!name || !email || !password) return res.status(400).json({ message: "All fields required" });
      
      if (await User.findOne({ email })) return res.status(400).json({ message: "User already exists" });
      
      const user = await User.create({ name, email, password: await bcrypt.hash(password, 10) });
      res.setHeader("Set-Cookie", setCookieHeader(createToken(user._id)));
      return res.status(201).json({ _id: user._id, name: user.name, email: user.email, assistantName: user.assistantName, assistantImage: user.assistantImage });
    }

    // -------- SIGNIN --------
    if (path === "/api/auth/signin" && req.method === "POST") {
      await connectDb();
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ message: "All fields required" });
      
      const user = await User.findOne({ email });
      if (!user || !(await bcrypt.compare(password, user.password))) return res.status(400).json({ message: "Invalid credentials" });
      
      res.setHeader("Set-Cookie", setCookieHeader(createToken(user._id)));
      return res.status(200).json({ _id: user._id, name: user.name, email: user.email, assistantName: user.assistantName, assistantImage: user.assistantImage });
    }

    // -------- LOGOUT --------
    if (path === "/api/auth/logout" && req.method === "GET") {
      res.setHeader("Set-Cookie", clearCookieHeader());
      return res.status(200).json({ message: "Logged out" });
    }

    // -------- GET CURRENT USER --------
    if (path === "/api/user/current" && req.method === "GET") {
      const token = getTokenFromCookies(req.headers.cookie);
      if (!token) return res.status(401).json({ message: "Not authenticated" });
      
      const decoded = verifyToken(token);
      if (!decoded) return res.status(401).json({ message: "Invalid token" });
      
      await connectDb();
      const user = await User.findById(decoded.userId).select("-password");
      if (!user) return res.status(404).json({ message: "User not found" });
      
      return res.status(200).json(user);
    }

    // -------- UPDATE ASSISTANT --------
    if (path === "/api/user/update" && req.method === "POST") {
      const token = getTokenFromCookies(req.headers.cookie);
      if (!token) return res.status(401).json({ message: "Not authenticated" });
      
      const decoded = verifyToken(token);
      if (!decoded) return res.status(401).json({ message: "Invalid token" });
      
      await connectDb();
      const { assistantName, imageUrl, imageBase64 } = req.body;
      let assistantImage = imageUrl;
      if (imageBase64) assistantImage = await uploadToCloudinary(imageBase64);
      
      const user = await User.findByIdAndUpdate(decoded.userId, { assistantName, assistantImage }, { new: true }).select("-password");
      return res.status(200).json(user);
    }

    // -------- ASK ASSISTANT --------
    if (path === "/api/user/asktoassistant" && req.method === "POST") {
      const token = getTokenFromCookies(req.headers.cookie);
      if (!token) return res.status(401).json({ message: "Not authenticated" });
      
      const decoded = verifyToken(token);
      if (!decoded) return res.status(401).json({ message: "Invalid token" });
      
      await connectDb();
      const user = await User.findById(decoded.userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      
      const { command } = req.body;
      const response = await geminiResponse(command, user.assistantName || "Assistant", user.name);
      
      let parsed;
      try { parsed = JSON.parse(response.replace(/```json\n?|\n?```/g, "").trim()); }
      catch { parsed = { type: "general", userInput: command, response }; }
      
      return res.status(200).json(parsed);
    }

    return res.status(404).json({ message: "Not found" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
}
