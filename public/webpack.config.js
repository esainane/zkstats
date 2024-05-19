const path = require('path');
const transformInferno = require('ts-plugin-inferno').default;

module.exports = {
  entry: './src/index.js',
  // output app.js and main.css to dist/
  output: {
    clean: true,
    compareBeforeEmit: true,
    cssFilename: 'main.css',
    filename: 'app.js',
    path: path.resolve(__dirname, 'dist'),
  },
  module: {
    rules: [
      {
        // JS/JSX support
        test: /\.jsx?$/,
        exclude: /node_modules/,
        use: ['babel-loader'],
      },
      {
        // SCSS support
        test: /\.(sa|sc|c)ss$/,
        exclude: /node_modules/,
        use: ['style-loader', 'css-loader', 'sass-loader'],
      },
      {
        // Typescript support
        test: /\.tsx?$/,
        exclude: /node_modules/,
        loader: 'ts-loader',
        options: {
          getCustomTransformers: () => ({
            after: [transformInferno()],
          }),
        }
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
    modules: [path.resolve(__dirname, 'node_modules')],
    alias: {
      // Switch between development and production versions of Inferno
      // This is a simpler approach than using dev:module as an entry point,
      // but may be changed later
      'inferno': (process.env.NODE_ENV !== 'production')
        ? 'inferno/dist/index.dev.esm.js'
        : 'inferno/dist/index.esm.js',
      // Direct react and react-dom to inferno-compat, where available
      'react': 'inferno-compat',
      'react-dom': 'inferno-compat'
    }
  },
  devServer: {
    static: path.join(__dirname, 'static'),
    liveReload: true,
  },
};
