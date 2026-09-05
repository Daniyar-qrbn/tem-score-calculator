# TEM Score Calculator

A simple score estimation tool for **TEM-4 (Test for English Majors Band 4)** and **TEM-8 (Test for English Majors Band 8)**.

专四 / 专八成绩估分工具，支持 Web 和微信小程序。

## Features

- TEM-4 and TEM-8 score calculation
- Switch between TEM-4 and TEM-8
- Score estimation by exam section
- Automatic total score calculation
- Grade result: Excellent / Good / Pass / Fail
- Input validation
- Web: local data storage; Mini Program: inputs kept only during the current session
- Responsive interface for desktop and mobile
- WeChat Mini Program version
- 微信小程序：全国参考结果“超过约 XX% 的考生”（仅供参考，非官方排名）

## Platforms

### Web

Built with vanilla:

- HTML
- CSS
- JavaScript

No framework or backend is required.

### WeChat Mini Program

A native WeChat Mini Program version is also included, using:

- WXML
- WXSS
- JavaScript
- In-memory inputs while switching TEM4/TEM8; empty forms on a fresh launch

## Privacy

The calculator does not require an account.

The Web version stores entered scores locally in the browser. The Mini Program keeps inputs only in memory during the current session, preserving them when switching TEM4/TEM8. Sharing (including cancellation) and returning from the background preserve the current inputs and result. A fresh launch that creates a new page starts with an empty TEM4 form. Closing the Mini Program UI may only background it; a retained page is the same session and is not reset. Previously stored Mini Program scores are ignored. Scores are not uploaded to a server.

## How It Works

1. Select **TEM-4** or **TEM-8**
2. Enter the number of correct answers or estimated score for each section
3. Click **Calculate**
4. View the estimated total score and grade

## Score Levels

| Score | Result |
|---|---|
| 80–100 | Excellent |
| 70–79.9 | Good |
| 60–69.9 | Pass |
| Below 60 | Fail |

## Disclaimer

This project is intended for score estimation only.

Actual exam structure, scoring rules, and final results should follow the official requirements for the corresponding examination year.

## Author

Developed by **Daniyar**.
