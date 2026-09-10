import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

export async function signup(req, res) {
  try {
    const { name, email, password, domain } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "name, email, password are required" });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, passwordHash, domain });

    const token = signToken(user._id);
    res.status(201).json({
      token,
      user: { id: user._id, name: user.name, email: user.email, domain: user.domain },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Signup failed" });
  }
}

export async function login(req, res) {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = signToken(user._id);
    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, domain: user.domain },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Login failed" });
  }
}
