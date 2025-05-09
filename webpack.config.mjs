import * as path from 'path';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import CopyWebpackPlugin from 'copy-webpack-plugin';

export default {
    mode: 'development',
    entry: './src/index.ts',
    devtool: 'source-map',
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
            {
                test: /\.css$/,
                use: [MiniCssExtractPlugin.loader, 'css-loader'],
            },
        ],
    },
    resolve: {
        extensions: ['.ts', '.js'],
    },
    output: {
        filename: 'bundle.js',
        path: path.resolve(import.meta.dirname, 'dist'),
    },
    devServer: {
        static: {
            directory: path.join(import.meta.dirname, 'dist'),
        },
        compress: true,
        port: 9000,
    },
    plugins: [
        new MiniCssExtractPlugin({
            filename: 'styles.css',
        }),
        new CopyWebpackPlugin({
            patterns: [{ from: 'public', to: '' }],
        }),
    ],
};
