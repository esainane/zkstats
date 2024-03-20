import LoadWait from "./components/LoadWait";
const ZKStats = (props, context) => {
    // Immediately fire off a request for our JSON data
    const data = fetch('all.json')
    // When this request completes, parse the data
    .then(response => response.json())
    // And to test the loading spinner, wait for a few seconds
    .then(data => new Promise(resolve => setTimeout(() => resolve(data), 300)));
    return (
        <div class="root">
        <LoadWait promise={data}><h1>Hello, world</h1></LoadWait>
        </div>
    );
};

export default ZKStats;
