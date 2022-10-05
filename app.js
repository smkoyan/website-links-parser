const axios = require('axios');

// replaced this lib with linkedom due to this issue: https://github.com/jsdom/jsdom/issues/2005
// const jsdom = require("jsdom");
// const { JSDOM } = jsdom;
const { parseHTML } = require('linkedom');
const fs = require('fs');

// Please fill here the input websites to be parsed in the format of example
const inputData = [ {_website:['https://hexact.io/']}, {_website:['https://onex.am/']}];


// to keep it simple global dependencies are used for final result and backtracking purposes
const visitedLinks = new Set();
const output = {};

const run = async (input) => {
    const websites = input.map(item => item._website);
    await parseWebsites(websites);

    const outputToStore = Object.keys(output).flatMap(website => output[website]);

    fs.writeFile('links.json', JSON.stringify(outputToStore, null, 2), function (err) {
        if (err) return console.log(err);
        console.log('Successfully created result json file');
    });
}

const parseWebsites = websites => {
    return Promise.all(websites.map(website => parseWebsite(website)));
}

const parseWebsite = async (url, maxDepth = Infinity, depth = 1) => {
    if (depth > maxDepth) {
        console.log('maximum depth limit exceeded, no more parsing');
        return;
    }
    console.log(`visiting url(${url}) in depth(${depth})`);
    let _url;
    try {
        _url = new URL(url)
    } catch (e) {
        console.error('Invalid url provided');
        return;
    }
    if (! (_url.origin in output)) {
        output[_url.origin] = [];
    }


    let response;

    try {
        response = await axios.get(_url.href);
    } catch (e) {
        let statusCode = 500;
        if (axios.isAxiosError(e)) {
            if (!e.response) {
                return;
            }
            statusCode = e.response.status;
        }
        output[_url.origin].push( makeOutput(_url, statusCode) );
        return;
    }
    output[_url.origin].push( makeOutput(_url) );


    const links = extractPageLinks(response.data);
    console.log('number of found links:', links.length);

    const filteredLinks = filterLinks(_url, links);
    console.log('number of filtered links:', filteredLinks.length);

    const uniqueLinks = getUniqueLinks(filteredLinks);
    console.log('number of unique links:', uniqueLinks.length);

    const properLinks = prepareLinks(_url, uniqueLinks);

    const unvisitedLinks = properLinks.filter(link => !visitedLinks.has(link));
    console.log('number of unvisited links:', unvisitedLinks.length);


    // visit links
    unvisitedLinks.forEach(link => visitedLinks.add(link));

    const websiteVisitPromises = unvisitedLinks.map(link => parseWebsite(link, maxDepth, depth + 1));

    await Promise.all(websiteVisitPromises);
};

// naming as in requirement PDF)
const makeOutput = (websiteURL, status = 200) => ({
    _website: websiteURL.origin,
    _link: websiteURL.href,
    _statusCode: status,
});

const extractPageLinks = (content) => {
    // const { document } = (new JSDOM(content, {url: websiteURL.href})).window;
    const { document } = parseHTML(content);

    return Array.from(document.querySelectorAll('a'))
        .map(link => link.href.trim());
};

// filter out the external and unnecessary links
const filterLinks = (websiteURL, links) => {
    return links.filter(link => {
        // same url (homepage)
        if (link === '/') {
            return false;
        }

        // on the same page
        if (link.startsWith('#')) {
            return false;
        }

        // blank page
        if (link.startsWith('about:blank')) {
            return false;
        }

        // absolute url which can lead to external website or to the same
        if (link.startsWith('http://') || link.startsWith('https://')) {
            try {
                const url = new URL(link);

                return url.host === websiteURL.host;
            } catch (e) {
                return false;
            }
        }

        try {
            new URL(link, websiteURL.href);
        } catch (e) {
            return false;
        }

        return true;
    });
}

const getUniqueLinks = links => Array.from(new Set(links));

const prepareLinks = (websiteURL, links) =>
    links.map(link => link.startsWith('http') ? link : (new URL(link, websiteURL.href).href));


void run(inputData);
