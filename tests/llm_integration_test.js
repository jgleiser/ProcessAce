const { getLlmProvider } = require('../src/llm');

async function testLlm() {
    process.env.LLM_API_KEY = 'sk-dummy-key-12345';
    process.env.LLM_MODEL = 'gpt-3.5-turbo';

    console.log('getting provider...');
    const provider = getLlmProvider();

    console.log('calling complete()...');
    try {
        await provider.complete('Hello, world!');
        console.log('Response received (unexpected with dummy key)');
    } catch (error) {
        if (error.status === 401) {
            console.log('TEST PASSED: Caught expected 401 Unauthorized from OpenAI');
        } else {
            console.error('TEST FAILED: Caught unexpected error:', error.message);
            process.exit(1);
        }
    }
}

testLlm();
