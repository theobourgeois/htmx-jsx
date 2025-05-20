import { createHTMXRouter, type RouteProps } from "./htmx";
import React from "react";

const htmx = createHTMXRouter({
    fastifyOptions: { logger: true },
    prefix: "/api",
    useFormbody: true,
    entryPoint: <App />,
    port: 3004,
    host: "localhost",
});
htmx.start();

const form = htmx({
    handler: RouteTest,
    method: "POST",
    target: "this",
    swap: "outerHTML",
    onBeforeRequest: (event) => {
        alert("before request");
        console.log("clicked", event);
    },
});

function App() {
    return (
        <form {...form}>
            <input type="text" name="name" />
            <input type="email" name="email" />
            <button>Submit</button>
        </form>
    );
}

const showMessage = htmx({
    handler: RouteTest2,
    method: "GET",
    target: "this",
    swap: "outerHTML",
    onClick: (event) => {
        alert("clicked");
    },
    vals: {
        message: "Hello",
    },
});

export function RouteTest({
    req,
    res,
    data,
}: RouteProps<{
    name: string;
    email: string;
}>) {
    return (
        <div>
            <h1>Hello {data.name}</h1>
            <p>Email: {data.email}</p>
            <button {...showMessage}>Show Message</button>
        </div>
    );
}

export function RouteTest2({
    req,
    res,
    data,
}: RouteProps<{
    message: string;
}>) {
    return (
        <div>
            <h1>Message: {data.message}</h1>
        </div>
    );
}
