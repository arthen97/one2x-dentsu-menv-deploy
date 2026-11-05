# One2X 电通大会报告：极小部署入口

本仓库只保存部署配置及无依赖 Node.js 构建脚本。完整报告、原始媒体的无损分段与校验清单均已先上传公开GitHub源码仓库：

https://github.com/arthen97/one2x-dentsu-film-report

固定源码提交：130eda427a9edceef22e7e5377ce2f9d924edc7b
固定源码树：b4a46519f87bac08368daad1114ea527bdd7892f

Menv 配置为 build.shape=static、build.root=.、build.output=dist。使用Node.js 22或更新版本，构建命令 npm run build，无第三方依赖。

默认构建从GitHub codeload的固定提交流式下载tar.gz，直接送tar解包，不保存大压缩包；去掉codeload外层目录。临时源码放在dist之外。随后执行原源码的scripts/build.mjs及scripts/verify-assets.mjs，逐片校验、流式解压拼接并验证全部逻辑文件的SHA256，最后将完整输出移动到本仓库dist/，清理临时源码。发布入口为dist/index.html。

本地离线验证可设置环境变量ONE2X_SOURCE_ARCHIVE为完整源码归档绝对路径，再运行npm run build。该归档无外层目录，使用strip-components=0；默认远程codeload使用strip-components=1。环境变量不写入Menv配置，线上仍使用固定GitHub提交。

最终输出323文件，含45个视频、192张图片、2个字体。内容及每个逻辑文件原始字节保持不变。dist、临时源码、node_modules均不提交Git；分段和全部媒体仍完整保存在原公开源码仓库中。
