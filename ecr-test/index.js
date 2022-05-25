const express = require("express");
const app = express();
const cors = require("cors");

try {
    app.use(express.json());
    app.use(cors());

    //READ Request Handlers

    app.get("/test", (req, res) => {
        try {
            console.log("=== GET request  at / ===");
            res.send({ msg: "testtesttesttesttesttest" });
            // res.sendFile("./healthcheck.html", { root: __dirname });
        } catch (e) {
            console.log(e);
        }
    });
    app.get("/", (req, res) => {
        try {
            console.log("=== GET request  at / ===");
            res.send({ msg: "goodododododododod" });
            // res.sendFile("./healthcheck.html", { root: __dirname });
        } catch (e) {
            console.log(e);
        }
    });

    app.get("*", (req, res) => {
        try {
            res.send({ msg: "nogood" });
            console.log("nogood");
        } catch (e) {
            console.log(e);
        }
    });

    const port = 80;
    app.listen(port, "0.0.0.0", () => console.log(`Listening on port ${port}..`));
} catch (e) {
    console.log(e);
}
